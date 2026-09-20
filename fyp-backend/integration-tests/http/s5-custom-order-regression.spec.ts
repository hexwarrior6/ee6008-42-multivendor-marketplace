import { createHmac } from "node:crypto"
import type {
  IAuthModuleService,
  ICustomerModuleService,
  IUserModuleService,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(600 * 1000)

type ActorType = "user" | "customer"

const encodeJwtPart = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

const signActorToken = (input: {
  actorId: string
  actorType: ActorType
  authIdentityId: string
}) => {
  const now = Math.floor(Date.now() / 1000)
  const header = encodeJwtPart({ alg: "HS256", typ: "JWT" })
  const payload = encodeJwtPart({
    actor_id: input.actorId,
    actor_type: input.actorType,
    auth_identity_id: input.authIdentityId,
    iat: now,
    exp: now + 60 * 60,
  })
  const unsigned = `${header}.${payload}`
  const signature = createHmac("sha256", process.env.JWT_SECRET || "supersecret")
    .update(unsigned)
    .digest("base64url")

  return `${unsigned}.${signature}`
}

/**
 * S5 regression over real HTTP: the happy-path workflow is covered by
 * s1-workflow.spec.ts. This suite proves the state machine and the
 * permission boundaries still hold when the API is driven the way clients
 * actually drive it — invalid jumps are rejected with 400, customers cannot
 * move the workflow, and nobody but the participants can open a chat
 * session. All authorization assertions fail before any TalkJS network
 * call, so the suite stays offline.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  // Actors, stores and the artisan profile are created once in beforeAll and
  // reused by all three scenarios below; keep the runner from truncating the
  // database between tests.
  disableAutoTeardown: true,
  testSuite: ({ api, getContainer }) => {
    let publishableKey: string
    let adminHeaders: { headers: Record<string, string> }
    let customerHeaders: { headers: Record<string, string> }
    let otherCustomerHeaders: { headers: Record<string, string> }
    let artisanId: string

    const createActor = async (
      actorType: ActorType,
      sequence: number,
      options: { platformAdmin?: boolean } = {}
    ) => {
      const container = getContainer()
      const authService = container.resolve(Modules.AUTH) as IAuthModuleService
      const email = `s5-http-${actorType}-${sequence}@example.com`
      const actor = actorType === "user"
        ? await (container.resolve(Modules.USER) as IUserModuleService).createUsers({
            email,
            first_name: "S5",
            last_name: options.platformAdmin ? "Admin" : "Seller",
            metadata: options.platformAdmin ? { is_super_admin: true } : {},
          })
        : await (
            container.resolve(Modules.CUSTOMER) as ICustomerModuleService
          ).createCustomers({ email })
      const authIdentity = await authService.createAuthIdentities({
        provider_identities: [
          {
            provider: "emailpass",
            entity_id: email,
            provider_metadata: {},
          },
        ],
        app_metadata: {
          [`${actorType}_id`]: actor.id,
        },
      })

      return {
        actor,
        token: signActorToken({
          actorId: actor.id,
          actorType,
          authIdentityId: authIdentity.id,
        }),
      }
    }

    beforeAll(async () => {
      const {
        createApiKeysWorkflow,
        createSalesChannelsWorkflow,
        linkSalesChannelsToApiKeyWorkflow,
      } = await import("@medusajs/medusa/core-flows")
      const container = getContainer()
      const { result: salesChannels } = await createSalesChannelsWorkflow(
        container
      ).run({
        input: {
          salesChannelsData: [{ name: "S5 regression storefront" }],
        },
      })
      const { result: apiKeys } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "S5 regression publishable key",
              type: "publishable",
              created_by: "s5-regression",
            },
          ],
        },
      })
      const apiKey = apiKeys[0] as { id: string; token?: string }
      if (!apiKey?.id || !apiKey.token) {
        throw new Error("The S5 regression publishable key was not created")
      }
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: apiKey.id, add: [salesChannels[0].id] },
      })
      publishableKey = apiKey.token

      const admin = await createActor("user", 1, { platformAdmin: true })
      const customer = await createActor("customer", 1)
      const otherCustomer = await createActor("customer", 2)
      adminHeaders = {
        headers: { authorization: `Bearer ${admin.token}` },
      }
      customerHeaders = {
        headers: {
          authorization: `Bearer ${customer.token}`,
          "x-publishable-api-key": publishableKey,
        },
      }
      otherCustomerHeaders = {
        headers: {
          authorization: `Bearer ${otherCustomer.token}`,
          "x-publishable-api-key": publishableKey,
        },
      }

      const storeModule = container.resolve(Modules.STORE) as {
        listStores: () => Promise<Array<{ id: string }>>
      }
      const stores = await storeModule.listStores()
      const storeId = stores[0]?.id

      const profileResponse = await api.post(
        "/admin/artisan-profiles",
        {
          store_id: storeId,
          display_name: "S5 Regression Artisan",
          bio: "Artisan profile used by the S5 state-machine regression suite",
          verification_status: "approved",
        },
        adminHeaders
      )
      expect(profileResponse.status).toBe(201)
      artisanId = profileResponse.data.artisan_profile.id
    })

    const createOrder = async () => {
      const response = await api.post(
        "/store/custom-orders",
        {
          artisan_id: artisanId,
          title: "S5 regression keepsake box",
          product_category: "woodwork",
          description: "S5 regression order used to exercise illegal jumps.",
          budget_amount: 50000,
          currency_code: "cny",
        },
        customerHeaders
      )
      expect(response.status).toBe(201)
      return response.data.custom_order.id as string
    }

    const expectRejected = async (
      orderId: string,
      body: Record<string, unknown>,
      messagePart: string
    ) => {
      const response = await api.post(
        `/admin/custom-orders/${orderId}`,
        body,
        { ...adminHeaders, validateStatus: () => true }
      )
      expect(response.status).toBe(400)
      expect(String(response.data.message)).toContain(messagePart)
    }

    it("walks the legal lifecycle over HTTP and rejects every illegal jump", async () => {
      const orderId = await createOrder()

      // Skipped stages and terminal reopening are all 400s.
      await expectRejected(orderId, { status: "produced" }, "request to produced")
      await expectRejected(orderId, { status: "delivered" }, "request to delivered")
      await expectRejected(
        orderId,
        { status: "quote" },
        "A positive quoted_amount is required"
      )

      await expect(api.post(
        `/admin/custom-orders/${orderId}`,
        { status: "quote", quoted_amount: 55000 },
        adminHeaders
      )).resolves.toMatchObject({ status: 200 })

      await expectRejected(orderId, { status: "produced" }, "quote to produced")

      // The quote is still adjustable up to the moment of confirmation, and
      // frozen immediately after it.
      const confirmed = await api.post(
        `/admin/custom-orders/${orderId}`,
        { status: "confirmed", quoted_amount: 60000 },
        adminHeaders
      )
      expect(confirmed.status).toBe(200)
      expect(confirmed.data.custom_order.status).toBe("confirmed")

      await expectRejected(
        orderId,
        { quoted_amount: 1 },
        "quote cannot be changed after confirmation"
      )
      await expectRejected(
        orderId,
        { status: "produced" },
        "Payment must be authorized"
      )

      const produced = await api.post(
        `/admin/custom-orders/${orderId}`,
        { status: "produced", payment_status: "authorized" },
        adminHeaders
      )
      expect(produced.status).toBe(200)
      expect(produced.data.custom_order.status).toBe("produced")

      // A produced order can no longer be cancelled.
      await expectRejected(
        orderId,
        { status: "cancelled", cancellation_reason: "changed mind" },
        "produced to cancelled"
      )

      const delivered = await api.post(
        `/admin/custom-orders/${orderId}`,
        { status: "delivered" },
        adminHeaders
      )
      expect(delivered.status).toBe(200)
      expect(delivered.data.custom_order.status).toBe("delivered")
      expect(delivered.data.custom_order.delivered_at).toBeTruthy()

      await expectRejected(orderId, { status: "confirmed" }, "delivered to confirmed")
      await expectRejected(
        orderId,
        { quoted_amount: 1 },
        "cannot change quote or category"
      )
    })

    it("requires a cancellation reason and keeps cancelled orders closed", async () => {
      const orderId = await createOrder()

      await expectRejected(
        orderId,
        { status: "cancelled" },
        "cancellation_reason is required"
      )

      const cancelled = await api.post(
        `/admin/custom-orders/${orderId}`,
        { status: "cancelled", cancellation_reason: "Buyer changed requirements" },
        adminHeaders
      )
      expect(cancelled.status).toBe(200)
      expect(cancelled.data.custom_order.status).toBe("cancelled")
      expect(cancelled.data.custom_order.cancellation_reason).toBe(
        "Buyer changed requirements"
      )
      expect(cancelled.data.custom_order.cancelled_at).toBeTruthy()

      await expectRejected(orderId, { status: "quote" }, "cancelled to quote")
    })

    it("keeps customers and strangers out of the workflow and the chat session", async () => {
      const orderId = await createOrder()

      // A customer cannot drive the workflow from the storefront API. The
      // framework maps the NOT_ALLOWED error to HTTP 400.
      for (const body of [
        { status: "confirmed" },
        { quoted_amount: 999 },
        { payment_status: "captured" },
        { cancellation_reason: "self cancel" },
      ]) {
        const response = await api.patch(
          `/store/custom-orders/${orderId}`,
          body,
          { ...customerHeaders, validateStatus: () => true }
        )
        expect(response.status).toBe(400)
        expect(String(response.data.message)).toContain(
          "Customers may only update custom order metadata"
        )
      }

      // TalkJS session: unauthenticated requests are stopped by the auth
      // middleware, strangers by the ownership check — both before TalkJS.
      const unauthenticated = await api.get(
        `/store/custom-orders/${orderId}/talkjs`,
        {
          headers: { "x-publishable-api-key": publishableKey },
          validateStatus: () => true,
        }
      )
      expect(unauthenticated.status).toBe(401)

      const stranger = await api.get(
        `/store/custom-orders/${orderId}/talkjs`,
        { ...otherCustomerHeaders, validateStatus: () => true }
      )
      expect(stranger.status).toBe(403)

      // A stranger cannot read the order either.
      const strangerDetail = await api.get(`/store/custom-orders/${orderId}`, {
        ...otherCustomerHeaders,
        validateStatus: () => true,
      })
      expect(strangerDetail.status).toBe(403)
    })
  },
})
