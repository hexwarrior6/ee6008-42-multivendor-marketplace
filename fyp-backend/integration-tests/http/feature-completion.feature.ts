import { createHmac } from "node:crypto"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { asValue } from "@medusajs/framework/awilix"
import { ensureCustomOrderCategory } from "../../src/scripts/setup-custom-order-category"
import { auditCustomOrderPayments } from "../../src/scripts/audit-custom-order-payments"
import { PAYMENT_BINDING_KEY } from "../../src/modules/custom-order/payment"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../src/modules/custom-order"
import {
  ARTISAN_PROFILE_MODULE,
  type ArtisanProfileService,
} from "../../src/modules/artisan-profile"

jest.setTimeout(600_000)
// Separate suffix keeps the normal HTTP suite from accidentally collecting a
// suite that requires the safety runner's explicitly isolated database.
const databaseName = process.env.FEATURE_TEST_DB_NAME
if (!databaseName || !/^medusa_feature_test_[a-f0-9]{32}$/.test(databaseName)) {
  throw new Error(
    "Run this suite through test:feature:http with an explicit TEST_DATABASE_URL"
  )
}
const signActor = (
  actorId: string,
  actorType: string,
  authIdentityId: string
) => {
  const part = (data: unknown) =>
    Buffer.from(JSON.stringify(data)).toString("base64url")
  const payload = `${part({ alg: "HS256", typ: "JWT" })}.${part({
    actor_id: actorId,
    actor_type: actorType,
    auth_identity_id: authIdentityId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`
  return `${payload}.${createHmac("sha256", process.env.JWT_SECRET!)
    .update(payload)
    .digest("base64url")}`
}

medusaIntegrationTestRunner({
  inApp: true,
  dbName: databaseName,
  disableAutoTeardown: true,
  hooks: {
    beforeServerStart: async (container) => {
      const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
      const url = config.projectConfig.databaseUrl
      if (!url || new URL(url).pathname !== `/${databaseName}`)
        throw new Error("Refusing migrations against a non-isolated database")
    },
  },
  testSuite: ({ api, getContainer }) => {
    let publicHeaders: any,
      adminHeaders: any,
      customerHeaders: any,
      otherHeaders: any,
      sellerHeaders: any
    let artisanId: string, customerId: string, storeId: string
    let seedId: string, sameId: string, hiddenId: string, draftId: string
    const service = () =>
      getContainer().resolve(CUSTOM_ORDER_MODULE) as CustomOrderService
    const actor = async (
      type: "user" | "customer",
      suffix: string,
      admin = false
    ) => {
      const container = getContainer()
      const email = `feature-${suffix}@example.com`
      const entity =
        type === "user"
          ? await container.resolve(Modules.USER).createUsers({
              email,
              metadata: admin ? { is_super_admin: true } : {},
            })
          : await container.resolve(Modules.CUSTOMER).createCustomers({ email })
      const identity = await container
        .resolve(Modules.AUTH)
        .createAuthIdentities({
          provider_identities: [
            { provider: "emailpass", entity_id: email, provider_metadata: {} },
          ],
          app_metadata: { [`${type}_id`]: entity.id },
        })
      return { id: entity.id, token: signActor(entity.id, type, identity.id) }
    }
    beforeAll(async () => {
      const container = getContainer()
      const stores = await container.resolve(Modules.STORE).listStores()
      storeId = stores[0].id
      // Direct workflow fixtures must supply the marketplace request scope.
      container.register({ currentStore: asValue({ id: storeId }) })
      const flows = await import("@medusajs/medusa/core-flows")
      const { result: channels } = await flows
        .createSalesChannelsWorkflow(container)
        .run({
          input: {
            salesChannelsData: [
              { name: "Feature public" },
              { name: "Feature private" },
            ],
          },
        })
      const { result: keys } = await flows
        .createApiKeysWorkflow(container)
        .run({
          input: {
            api_keys: [
              {
                title: "Feature tests",
                type: "publishable",
                created_by: "feature-tests",
              },
            ],
          },
        })
      await flows
        .linkSalesChannelsToApiKeyWorkflow(container)
        .run({ input: { id: keys[0].id, add: [channels[0].id] } })
      publicHeaders = { headers: { "x-publishable-api-key": keys[0].token } }
      const admin = await actor("user", "admin", true)
      const customer = await actor("customer", "buyer")
      const other = await actor("customer", "stranger")
      const seller = await actor("user", "seller")
      customerId = customer.id
      adminHeaders = { headers: { authorization: `Bearer ${admin.token}` } }
      sellerHeaders = { headers: { authorization: `Bearer ${seller.token}` } }
      customerHeaders = {
        headers: {
          ...publicHeaders.headers,
          authorization: `Bearer ${customer.token}`,
        },
      }
      otherHeaders = {
        headers: {
          ...publicHeaders.headers,
          authorization: `Bearer ${other.token}`,
        },
      }
      await container.resolve(ContainerRegistrationKeys.LINK).create({
        [Modules.USER]: { user_id: seller.id },
        [Modules.STORE]: { store_id: storeId },
      })
      const profiles = container.resolve(
        ARTISAN_PROFILE_MODULE
      ) as ArtisanProfileService
      const profile = await profiles.createArtisanProfiles({
        store_id: storeId,
        artisan_user_id: seller.id,
        display_name: "Feature Artisan",
        verification_status: "approved",
      })
      artisanId = profile.id
      const { result: categories } = await flows
        .createProductCategoriesWorkflow(container)
        .run({
          input: {
            product_categories: [
              { name: "Feature Category", is_active: true, is_internal: false },
            ],
          },
        })
      const makeProduct = (
        title: string,
        channel: string,
        status: "published" | "draft" = "published"
      ) => ({
        title,
        status,
        category_ids: [categories[0].id],
        sales_channels: [{ id: channel }],
        options: [{ title: "Size", values: ["Default"] }],
        variants: [
          {
            title: "Default",
            options: { Size: "Default" },
            manage_inventory: false,
            prices: [{ amount: 10, currency_code: "usd" }],
          },
        ],
      })
      const { result: products } = await flows
        .createProductsWorkflow(container)
        .run({
          input: {
            products: [
              makeProduct("Feature Seed", channels[0].id),
              makeProduct("Feature Same", channels[0].id),
              makeProduct("Feature Hidden", channels[1].id),
              makeProduct("Feature Draft", channels[0].id, "draft"),
            ],
          },
        })
      ;[seedId, sameId, hiddenId, draftId] = products.map(
        (product) => product.id
      )
    })
    const createQuoted = async () => {
      const created = await api.post(
        "/store/custom-orders",
        {
          artisan_id: artisanId,
          title: "Feature custom item",
          description: "Isolated integration test request",
          currency_code: "cny",
        },
        customerHeaders
      )
      expect(created.status).toBe(201)
      const quoted = await api.post(
        `/admin/custom-orders/${created.data.custom_order.id}`,
        { status: "quote", quoted_amount: 680 },
        adminHeaders
      )
      expect(quoted.status).toBe(200)
      return quoted.data.custom_order
    }
    const accepted = (order: any) => ({
      version: order.version,
      quoted_amount: order.quoted_amount,
      currency_code: order.currency_code,
    })

    it("returns real recommendations without leaking other-channel or draft products", async () => {
      const response = await api.get(
        `/store/recommendations?product_id=${seedId}&limit=8`,
        publicHeaders
      )
      expect(response.status).toBe(200)
      expect(response.data).toMatchObject({
        source: "rules",
        personalized: false,
      })
      expect(
        response.data.recommendations.map((item: any) => item.product_id)
      ).toEqual([sameId])
      for (const id of [seedId, hiddenId, draftId])
        expect(response.data.recommendations).not.toContainEqual(
          expect.objectContaining({ product_id: id })
        )
      const hidden = await api.get(
        `/store/recommendations?product_id=${hiddenId}`,
        { ...publicHeaders, validateStatus: () => true }
      )
      expect(hidden.status).toBe(404)
    })
    const s4Test =
      process.env.FEATURE_S4_ROOT && process.env.FEATURE_S4_PYTHON
        ? it
        : it.skip
    s4Test(
      "serves an actual S4 training export over HTTP with identity/channel isolation and safe fallback",
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "s1-s4-http-"))
        const file = join(directory, "recommendations.json")
        const previous = process.env.RECOMMENDATIONS_FILE
        try {
          const ids = [seedId, sameId, hiddenId, draftId]
          const rows = [
            "customer_id,product_id,title,weight",
            `${customerId},${seedId},Obsolete exported title,1`,
          ]
          for (let user = 0; user < 7; user++)
            for (let product = 0; product < ids.length; product++) {
              if (product !== user % ids.length)
                rows.push(
                  `fixture_user_${user},${ids[product]},Obsolete exported title,1`
                )
            }
          const csv = join(directory, "interactions.csv")
          await writeFile(csv, rows.join("\n"))
          const trained = spawnSync(
            process.env.FEATURE_S4_PYTHON!,
            [
              "-m",
              "recommender.train",
              "--offline-rows",
              csv,
              "--models",
              "svd,als",
              "--k",
              "8",
              "--seed",
              "0",
              "--export",
              file,
            ],
            {
              cwd: process.env.FEATURE_S4_ROOT!,
              encoding: "utf8",
              timeout: 60000,
              windowsHide: true,
              env: {
                ...process.env,
                DATABASE_URL: "sqlite:///:memory:",
                PYTHONPATH: join(process.env.FEATURE_S4_ROOT!, "src"),
                PYTHONIOENCODING: "utf-8",
              },
            }
          )
          if (trained.status !== 0)
            throw new Error(
              `Offline S4 fixture training failed: ${
                trained.error?.message ?? trained.stderr
              }`
            )
          const exported = JSON.parse(await readFile(file, "utf8"))
          expect(["svd", "als"]).toContain(exported.source)
          expect(
            exported.by_user[customerId].some(
              (x: any) => x.product_id === sameId
            )
          ).toBe(true)
          process.env.RECOMMENDATIONS_FILE = file
          const personalized = await api.get(
            "/store/recommendations?limit=4",
            customerHeaders
          )
          expect(personalized.data).toMatchObject({
            source: exported.source,
            model_version: exported.model_version,
            personalized: true,
            strategy: "by_user",
            context: { customer_id: customerId },
          })
          expect(
            personalized.data.recommendations.map((x: any) => x.product_id)
          ).toEqual([sameId])
          expect(personalized.data.recommendations[0].title).toBe(
            "Feature Same"
          )
          expect(personalized.headers["cache-control"]).toBe(
            "private, no-store"
          )
          expect(personalized.data).not.toHaveProperty("by_user")
          const similar = await api.get(
            `/store/recommendations?product_id=${seedId}`,
            publicHeaders
          )
          expect(similar.data).toMatchObject({
            strategy: "by_product",
            personalized: false,
            source: exported.source,
          })
          expect(
            similar.data.recommendations.map((x: any) => x.product_id)
          ).toEqual([sameId])
          const fallback = await api.get(
            "/store/recommendations",
            publicHeaders
          )
          expect(fallback.data).toMatchObject({
            strategy: "fallback",
            personalized: false,
          })
          expect(fallback.data.context).not.toHaveProperty("customer_id")
          expect(
            fallback.data.recommendations.every((x: any) =>
              [seedId, sameId].includes(x.product_id)
            )
          ).toBe(true)
          const forged = await api.get(
            `/store/recommendations?customer_id=${customerId}`,
            { ...otherHeaders, validateStatus: () => true }
          )
          expect(forged.status).toBe(400)
          await writeFile(
            file,
            JSON.stringify({
              ...exported,
              generated_at: "2000-01-01T00:00:00Z",
            })
          )
          const expired = await api.get("/store/recommendations", publicHeaders)
          expect(expired.data).toMatchObject({
            source: "rules",
            fallback_reason: "expired",
            personalized: false,
          })
          await writeFile(file, "{invalid")
          const invalid = await api.get("/store/recommendations", publicHeaders)
          expect(invalid.data).toMatchObject({
            source: "rules",
            fallback_reason: "invalid",
          })
          await writeFile(file, JSON.stringify(exported))
          const recovered = await api.get(
            "/store/recommendations",
            customerHeaders
          )
          expect(recovered.data.strategy).toBe("by_user")
        } finally {
          if (previous === undefined) delete process.env.RECOMMENDATIONS_FILE
          else process.env.RECOMMENDATIONS_FILE = previous
          await rm(directory, { recursive: true, force: true })
        }
      }
    )
    it("lets the buyer confirm and records their identity through production and delivery", async () => {
      const order = await createQuoted()
      const result = await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      expect(result.data.custom_order.status).toBe("confirmed")
      expect(result.data.custom_order.payment_status).toBe("pending")
      const history = await service().listCustomOrderStatusHistories({
        custom_order_id: order.id,
      })
      expect(history).toContainEqual(
        expect.objectContaining({
          from_status: "quote",
          to_status: "confirmed",
          actor_type: "customer",
          actor_id: customerId,
        })
      )
      const blocked = await api.post(
        `/admin/custom-orders/${order.id}`,
        { status: "produced" },
        { ...adminHeaders, validateStatus: () => true }
      )
      expect(blocked.status).toBe(400)
      // A test-only admin mutation exercises the payment gate; it is not a provider payment.
      await api.post(
        `/admin/custom-orders/${order.id}`,
        { payment_status: "authorized", status: "produced" },
        adminHeaders
      )
      const delivered = await api.post(
        `/admin/custom-orders/${order.id}`,
        { status: "delivered" },
        adminHeaders
      )
      expect(delivered.data.custom_order.status).toBe("delivered")
      expect(delivered.data.custom_order.delivered_at).toBeTruthy()
    })
    it("rejects a stale quote, another buyer and payment/status field injection", async () => {
      const order = await createQuoted()
      const stranger = await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        { ...otherHeaders, validateStatus: () => true }
      )
      expect(stranger.status).toBe(403)
      const injection = await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        { ...accepted(order), payment_status: "captured" },
        { ...customerHeaders, validateStatus: () => true }
      )
      expect(injection.status).toBe(400)
      await api.post(
        `/admin/custom-orders/${order.id}`,
        { quoted_amount: 700 },
        adminHeaders
      )
      const stale = await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        { ...customerHeaders, validateStatus: () => true }
      )
      expect(stale.status).toBe(409)
      expect(
        (await service().retrieveCustomOrderRequest(order.id)).status
      ).toBe("quote")
    })
    it("confirms at most once when two requests race", async () => {
      const order = await createQuoted()
      const results = await Promise.all(
        [1, 2].map(() =>
          api.post(
            `/store/custom-orders/${order.id}/confirm`,
            accepted(order),
            { ...customerHeaders, validateStatus: () => true }
          )
        )
      )
      expect(results.filter((result) => result.status === 200)).toHaveLength(1)
      expect(
        results.every((result) => [200, 400, 409].includes(result.status))
      ).toBe(true)
      const histories = await service().listCustomOrderStatusHistories({
        custom_order_id: order.id,
      })
      expect(
        histories.filter((entry) => entry.to_status === "confirmed")
      ).toHaveLength(1)
    })
    it("aggregates assigned artisans for admins and isolates seller analytics", async () => {
      const today = new Date().toISOString().slice(0, 10)
      const suffix = `?from=${today}&to=${today}&currency_code=cny`
      const expected = await service().listAndCountCustomOrderRequests({
        artisan_id: artisanId,
        currency_code: "cny",
      })
      const admin = await api.get(
        `/admin/analytics/custom-orders${suffix}&store_id=${storeId}`,
        adminHeaders
      )
      const seller = await api.get(
        `/admin/analytics/custom-orders${suffix}`,
        sellerHeaders
      )
      expect(admin.data.summary.requests).toBe(expected[1])
      expect(seller.data.summary.requests).toBe(expected[1])
      expect(admin.data.period.to).toBe(`${today}T23:59:59.999Z`)
      expect(seller.data.summary).not.toHaveProperty("revenue")
      const denied = await api.get(
        `/admin/analytics/custom-orders${suffix}&store_id=store-other`,
        { ...sellerHeaders, validateStatus: () => true }
      )
      expect(denied.status).toBe(400)
    })
    it("initializes the formal custom category idempotently without a full seed", async () => {
      const product = getContainer().resolve(Modules.PRODUCT)
      const first = await ensureCustomOrderCategory(product)
      const second = await ensureCustomOrderCategory(product)
      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(second.category.id).toBe(first.category.id)
      expect(second.category.metadata?.custom_order_enabled).toBe(true)
    })
    it("rejects direct collection preparation while payments are disabled without binding the order", async () => {
      const order = await createQuoted()
      await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      const enabled = process.env.WECHAT_PAY_ENABLED
      const sandbox = process.env.WECHAT_PAY_SANDBOX
      try {
        process.env.WECHAT_PAY_ENABLED = "false"
        process.env.WECHAT_PAY_SANDBOX = "false"
        await expect(
          api.post(
            `/store/custom-orders/${order.id}/payment-collection`,
            {},
            customerHeaders
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
        const { data } = await api.get(
          `/store/custom-orders/${order.id}/payment-collection`,
          customerHeaders
        )
        expect(data.payment_collection).toBeNull()
      } finally {
        if (enabled === undefined) delete process.env.WECHAT_PAY_ENABLED
        else process.env.WECHAT_PAY_ENABLED = enabled
        if (sandbox === undefined) delete process.env.WECHAT_PAY_SANDBOX
        else process.env.WECHAT_PAY_SANDBOX = sandbox
      }
    })
    it("prepares a single durable payment collection when two buyer requests race", async () => {
      const order = await createQuoted()
      await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      const path = `/store/custom-orders/${order.id}/payment-collection`
      const responses = await Promise.all(
        [1, 2].map(() => api.post(path, {}, customerHeaders))
      )
      expect(responses[0].data.payment_collection.id).toBe(
        responses[1].data.payment_collection.id
      )
      expect(responses[0].data).toMatchObject({
        payment_status: "pending",
        payment_collection: {
          amount: 6.8,
          currency_code: "cny",
          status: "not_paid",
          verification: "unverified",
        },
      })
      const collections = await getContainer()
        .resolve(Modules.PAYMENT)
        .listPaymentCollections({}, { take: 100 })
      expect(
        collections.filter(
          (collection) => collection.metadata?.custom_order_id === order.id
        )
      ).toHaveLength(1)
      const ledger = await getContainer()
        .resolve(Modules.PAYMENT)
        .retrievePaymentCollection(responses[0].data.payment_collection.id, {
          relations: ["payment_sessions", "payments"],
        })
      expect(ledger.payment_sessions).toHaveLength(0)
      expect(ledger.payments).toHaveLength(0)
      const read = await api.get(path, customerHeaders)
      expect(read.data).toEqual(responses[0].data)
      const binding = (await service().retrieveCustomOrderRequest(order.id))
        .metadata?.[PAYMENT_BINDING_KEY]
      await api.patch(
        `/store/custom-orders/${order.id}`,
        { metadata: { note: "updated" } },
        customerHeaders
      )
      expect(
        (await service().retrieveCustomOrderRequest(order.id)).metadata?.[
          PAYMENT_BINDING_KEY
        ]
      ).toBe(binding)
      for (const body of [
        { payment_status: "captured" },
        { status: "produced" },
        { status: "cancelled", cancellation_reason: "test" },
      ]) {
        const blocked = await api.post(
          `/admin/custom-orders/${order.id}`,
          body,
          { ...adminHeaders, validateStatus: () => true }
        )
        expect([400, 403]).toContain(blocked.status)
      }
      const deleted = await api.delete(`/admin/custom-orders/${order.id}`, {
        ...adminHeaders,
        validateStatus: () => true,
      })
      expect(deleted.status).toBe(400)
    })
    it("rejects cross-buyer payment access, premature preparation and client-supplied binding", async () => {
      const order = await createQuoted()
      const path = `/store/custom-orders/${order.id}/payment-collection`
      expect(
        (
          await api.post(
            path,
            {},
            { ...customerHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(400)
      expect(
        (await api.get(path, { ...otherHeaders, validateStatus: () => true }))
          .status
      ).toBe(403)
      expect(
        (
          await api.post(
            path,
            {},
            { ...otherHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(403)
      await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      expect(
        (
          await api.post(
            path,
            { amount: 1, payment_collection_id: "pay_col_foreign" },
            { ...customerHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(400)
      expect(
        (
          await api.patch(
            `/store/custom-orders/${order.id}`,
            { metadata: { [PAYMENT_BINDING_KEY]: "pay_col_foreign" } },
            { ...customerHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(400)
    })
    it("reuses one mock WeChat session under concurrent requests and blocks generic checkout bypass", async () => {
      const order = await createQuoted()
      await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      const path = `/store/custom-orders/${order.id}`
      const availability = await api.get(
        `${path}/payment-session`,
        customerHeaders
      )
      expect(availability.data).toEqual({
        enabled: true,
        mode: "mock",
        currency_code: "cny",
      })
      expect(
        (
          await api.get(`${path}/payment-session`, {
            ...otherHeaders,
            validateStatus: () => true,
          })
        ).status
      ).toBe(403)
      const prepared = await api.post(
        `${path}/payment-collection`,
        {},
        customerHeaders
      )
      const sessions = await Promise.all(
        [1, 2].map(() =>
          api.post(`${path}/payment-session`, {}, customerHeaders)
        )
      )
      expect(sessions[0].data.payment_session.id).toBe(
        sessions[1].data.payment_session.id
      )
      expect(sessions[0].data.payment_session).toMatchObject({
        mode: "mock",
        amount: 6.8,
        currency_code: "cny",
        status: "pending",
      })
      expect(sessions[0].data.payment_session).not.toHaveProperty("data")
      const collection = await getContainer()
        .resolve(Modules.PAYMENT)
        .retrievePaymentCollection(prepared.data.payment_collection.id, {
          relations: ["payment_sessions"],
        })
      expect(collection.payment_sessions).toHaveLength(1)
      const bypass = await api.post(
        `/store/payment-collections/${collection.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        { ...publicHeaders, validateStatus: () => true }
      )
      expect(bypass.status).toBe(403)
      expect(
        (
          await api.post(
            `${path}/payment-session`,
            {},
            { ...otherHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(403)
      expect(
        (
          await api.post(
            `${path}/payment-session`,
            { data: { mock: false } },
            { ...customerHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(400)
      const status = await api.post(
        `${path}/payment-status`,
        {},
        customerHeaders
      )
      expect(status.data).toEqual({
        payment_status: "pending",
        verification: "simulated",
      })
    })
    it("never promotes a simulated capture to real payment or production", async () => {
      const order = await createQuoted()
      await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      const path = `/store/custom-orders/${order.id}`
      await api.post(`${path}/payment-collection`, {}, customerHeaders)
      const session = await api.post(
        `${path}/payment-session`,
        {},
        customerHeaders
      )
      const payment = await getContainer()
        .resolve(Modules.PAYMENT)
        .authorizePaymentSession(session.data.payment_session.id, {})
      const { capturePaymentWorkflow } = await import(
        "@medusajs/medusa/core-flows"
      )
      await capturePaymentWorkflow(getContainer()).run({
        input: { payment_id: payment.id },
      })
      // Prove the asynchronous subscriber updates proof without the buyer's refresh endpoint.
      let recorded: any
      for (let attempt = 0; attempt < 20; attempt++) {
        recorded = await service().retrieveCustomOrderRequest(order.id)
        if (
          recorded.metadata?.__custom_order_payment_verification === "simulated"
        )
          break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(recorded.metadata?.__custom_order_payment_verification).toBe(
        "simulated"
      )
      expect(recorded.payment_status).toBe("pending")
      const result = await api.post(
        `${path}/payment-status`,
        {},
        customerHeaders
      )
      expect(result.data).toEqual({
        payment_status: "pending",
        verification: "simulated",
      })
      const blocked = await api.post(
        `/admin/custom-orders/${order.id}`,
        { status: "produced" },
        { ...adminHeaders, validateStatus: () => true }
      )
      expect(blocked.status).toBe(400)
      const forged = await api.patch(
        path,
        { metadata: { __custom_order_payment_verification: "verified" } },
        { ...customerHeaders, validateStatus: () => true }
      )
      expect(forged.status).toBe(400)
      expect(
        (
          await api.post(
            `${path}/payment-status`,
            {},
            { ...otherHeaders, validateStatus: () => true }
          )
        ).status
      ).toBe(403)
    })
    it("serializes platform full refunds and blocks generic refund bypass", async () => {
      const order = await createQuoted()
      await api.post(
        `/store/custom-orders/${order.id}/confirm`,
        accepted(order),
        customerHeaders
      )
      const path = `/store/custom-orders/${order.id}`
      await api.post(`${path}/payment-collection`, {}, customerHeaders)
      const session = await api.post(
        `${path}/payment-session`,
        {},
        customerHeaders
      )
      const payments = getContainer().resolve(Modules.PAYMENT)
      const payment = await payments.authorizePaymentSession(
        session.data.payment_session.id,
        {}
      )
      const { capturePaymentWorkflow } = await import(
        "@medusajs/medusa/core-flows"
      )
      await capturePaymentWorkflow(getContainer()).run({
        input: { payment_id: payment.id },
      })
      await api.post(`${path}/payment-status`, {}, customerHeaders)
      const current = await service().retrieveCustomOrderRequest(order.id)
      const body = { version: current.version, reason: "模拟：生产前全额退款" }
      const refundPath = `/admin/custom-orders/${order.id}/refund`
      for (const headers of [sellerHeaders, customerHeaders, otherHeaders]) {
        const denied = await api.post(refundPath, body, {
          ...headers,
          validateStatus: () => true,
        })
        expect([401, 403]).toContain(denied.status)
      }
      const injected = await api.post(
        refundPath,
        { ...body, amount: 1 },
        { ...adminHeaders, validateStatus: () => true }
      )
      expect(injected.status).toBe(400)
      const stale = await api.post(
        refundPath,
        { ...body, version: 0 },
        { ...adminHeaders, validateStatus: () => true }
      )
      expect(stale.status).toBe(409)
      const bypass = await api.post(
        `/admin/payments/${payment.id}/refund`,
        { amount: 6.8 },
        { ...adminHeaders, validateStatus: () => true }
      )
      expect(bypass.status).toBe(403)
      const results = await Promise.all(
        [1, 2].map(() =>
          api.post(refundPath, body, {
            ...adminHeaders,
            validateStatus: () => true,
          })
        )
      )
      expect(results.every((result) => result.status === 200)).toBe(true)
      for (const result of results)
        expect(result.data).toMatchObject({
          custom_order: { status: "cancelled" },
          refund: {
            status: "completed",
            mode: "mock",
            verification: "simulated_refund",
          },
        })
      const duplicate = await api.post(refundPath, body, adminHeaders)
      expect(duplicate.data.refund.status).toBe("completed")
      const read = await api.get(refundPath, adminHeaders)
      expect(read.data.refund.verification).toBe("simulated_refund")
      const ledger = await payments.retrievePayment(payment.id, {
        relations: ["refunds"],
      })
      expect(ledger.refunds).toHaveLength(1)
      expect(ledger.data?.out_refund_no).toMatch(/^CR[a-f0-9]{30}$/)
      const histories = await service().listCustomOrderStatusHistories({
        custom_order_id: order.id,
      })
      expect(
        histories.filter((entry) => entry.to_status === "cancelled")
      ).toHaveLength(1)
    })
    it("reports verified capture snapshots without counting simulated or manual paid markers", async () => {
      const today = new Date().toISOString().slice(0, 10)
      const suffix = `?from=${today}&to=${today}&currency_code=cny`
      for (const headers of [adminHeaders, sellerHeaders]) {
        const report = await api.get(
          `/admin/analytics/custom-order-payments${suffix}`,
          headers
        )
        expect(report.status).toBe(200)
        expect(report.data).toMatchObject({
          financial_report: false,
          amount_unit: "major",
          truncated: false,
          summary: { verified_capture_amount: 0, verified_orders: 0 },
        })
        expect(report.data.summary.simulated_orders).toBeGreaterThanOrEqual(1)
        expect(report.data).not.toHaveProperty("payments")
        expect(report.data).not.toHaveProperty("customer_id")
      }
      const forbidden = await api.get(
        `/admin/analytics/custom-order-payments${suffix}&store_id=store-other`,
        { ...sellerHeaders, validateStatus: () => true }
      )
      expect(forbidden.status).toBe(400)
    })
    it("audits an orphaned collection without deleting it or mutating its order", async () => {
      const order = await createQuoted()
      const payment = getContainer().resolve(Modules.PAYMENT)
      const orphan = await payment.createPaymentCollections({
        currency_code: "cny",
        amount: 6.8,
        metadata: { custom_order_id: order.id },
      })
      const result = await auditCustomOrderPayments(service(), payment)
      expect(result.read_only).toBe(true)
      expect(result.issues).toContainEqual({
        order_id: order.id,
        collection_id: orphan.id,
        issue: "unbound_collection",
      })
      expect((await payment.retrievePaymentCollection(orphan.id)).id).toBe(
        orphan.id
      )
      expect(
        (await service().retrieveCustomOrderRequest(order.id)).version
      ).toBe(order.version)
    })
  },
})
