import { createHmac } from "node:crypto"
import type {
  IAuthModuleService,
  ICustomerModuleService,
  IStoreModuleService,
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
  const signature = createHmac(
    "sha256",
    process.env.JWT_SECRET || "supersecret"
  )
    .update(unsigned)
    .digest("base64url")

  return `${unsigned}.${signature}`
}

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let publishableKey: string
    let adminHeaders: { headers: Record<string, string> }
    let customerHeaders: { headers: Record<string, string> }
    let otherCustomerHeaders: { headers: Record<string, string> }
    let storeId: string
    let artisanId: string

    const createActor = async (
      actorType: ActorType,
      sequence: number,
      options: { platformAdmin?: boolean } = {}
    ) => {
      const container = getContainer()
      const authService = container.resolve(Modules.AUTH) as IAuthModuleService
      const email = `s1-http-${actorType}-${sequence}@example.com`
      const actor = actorType === "user"
        ? await (container.resolve(Modules.USER) as IUserModuleService).createUsers({
            email,
            first_name: "S1",
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
          salesChannelsData: [{ name: "S1 workflow integration storefront" }],
        },
      })
      const { result: apiKeys } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "S1 workflow integration publishable key",
              type: "publishable",
              created_by: "s1-workflow-integration",
            },
          ],
        },
      })
      const apiKey = apiKeys[0] as { id: string; token?: string }
      if (!apiKey?.id || !apiKey.token) {
        throw new Error("The S1 workflow publishable key was not created")
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

      const storeService = container.resolve(Modules.STORE) as IStoreModuleService
      const stores = await storeService.listStores({}, { take: 1 })
      const store = stores[0] ?? await storeService.createStores({
        name: "S1 workflow integration store",
      })
      storeId = store.id

      const profileResponse = await api.post(
        "/admin/artisan-profiles",
        {
          store_id: storeId,
          display_name: "S1 Workflow Artisan",
          bio: "Profile created through the authenticated admin HTTP API",
          verification_status: "approved",
        },
        adminHeaders
      )
      expect(profileResponse.status).toBe(201)
      artisanId = profileResponse.data.artisan_profile.id
    })

    it("completes the authenticated custom-order workflow and enforces customer isolation", async () => {
      const createdResponse = await api.post(
        "/store/custom-orders",
        {
          artisan_id: artisanId,
          title: "Hand-carved keepsake box",
          product_category: "woodwork",
          description: "Create a personalized keepsake box with engraved initials.",
          budget_amount: 68000,
          currency_code: "cny",
        },
        customerHeaders
      )
      expect(createdResponse.status).toBe(201)
      expect(createdResponse.data.custom_order).toEqual(
        expect.objectContaining({
          artisan_id: artisanId,
          status: "request",
          currency_code: "cny",
        })
      )
      const orderId = createdResponse.data.custom_order.id as string

      const forbiddenResponse = await api.get(
        `/store/custom-orders/${orderId}`,
        {
          ...otherCustomerHeaders,
          validateStatus: () => true,
        }
      )
      expect(forbiddenResponse.status).toBe(403)

      const messageResponse = await api.post(
        `/store/custom-orders/${orderId}/messages`,
        {
          message: "Please engrave the initials S1 on the lid.",
          attachments: [
            { type: "image", url: "https://example.com/reference.png" },
          ],
        },
        customerHeaders
      )
      expect(messageResponse.status).toBe(201)
      expect(messageResponse.data.message).toEqual(
        expect.objectContaining({
          sender_type: "customer",
          message: "Please engrave the initials S1 on the lid.",
        })
      )

      const transitions = [
        { status: "quote", quoted_amount: 72000 },
        { status: "confirmed" },
        { status: "produced", payment_status: "authorized" },
        { status: "delivered" },
      ]
      for (const transition of transitions) {
        const response = await api.post(
          `/admin/custom-orders/${orderId}`,
          transition,
          adminHeaders
        )
        expect(response.status).toBe(200)
        expect(response.data.custom_order.status).toBe(transition.status)
      }

      const historyResponse = await api.get(
        `/admin/custom-orders/${orderId}/history`,
        adminHeaders
      )
      expect(historyResponse.status).toBe(200)
      expect(historyResponse.data.history.map(
        (entry: { to_status: string }) => entry.to_status
      )).toEqual(["request", "quote", "confirmed", "produced", "delivered"])

      const messagesResponse = await api.get(
        `/store/custom-orders/${orderId}/messages`,
        customerHeaders
      )
      expect(messagesResponse.status).toBe(200)
      expect(messagesResponse.data.messages).toHaveLength(1)

      const listResponse = await api.get("/store/custom-orders", customerHeaders)
      expect(listResponse.status).toBe(200)
      expect(listResponse.data.custom_orders).toContainEqual(
        expect.objectContaining({ id: orderId, status: "delivered" })
      )
    })
  },
})
