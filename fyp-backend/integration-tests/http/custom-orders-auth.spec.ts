import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(600 * 1000)

/**
 * This suite boots the real Medusa application and exercises the registered
 * middleware.  Route unit tests can prove handler behaviour, but only this
 * HTTP test proves an unauthenticated request is rejected before the handler
 * can read or create an order.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let publishableKey: string

    beforeAll(async () => {
      // Store routes also require a valid publishable key. Create one inside
      // the isolated test database so the assertion reaches the customer
      // authentication middleware instead of failing on the channel guard.
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
          salesChannelsData: [{ name: "S1 integration storefront" }],
        },
      })
      const { result: apiKeys } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "S1 integration publishable key",
              type: "publishable",
              created_by: "s1-integration",
            },
          ],
        },
      })
      const apiKey = apiKeys[0] as { id: string; token?: string }
      if (!apiKey?.id || !apiKey.token) {
        throw new Error("The integration publishable API key was not created")
      }
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: apiKey.id, add: [salesChannels[0].id] },
      })
      publishableKey = apiKey.token
    })

    describe("Store custom-order authentication", () => {
      it("rejects unauthenticated root and nested requests", async () => {
        const listResponse = await api.get("/store/custom-orders", {
          headers: { "x-publishable-api-key": publishableKey },
          validateStatus: () => true,
        })

        expect(listResponse.status).toBe(401)

        const nestedResponse = await api.get(
          "/store/custom-orders/cor_01J8V6H8XJ6D0QW8B7QZ6R4T2Y/messages",
          {
            headers: { "x-publishable-api-key": publishableKey },
            validateStatus: () => true,
          }
        )

        expect(nestedResponse.status).toBe(401)
      })
    })
  },
})
