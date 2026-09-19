import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ARTISAN_PROFILE_MODULE,
  type ArtisanProfileService,
} from "../../src/modules/artisan-profile"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../src/modules/custom-order"

jest.setTimeout(600 * 1000)

/**
 * Boots the real application against an isolated database. Besides checking
 * the public HTTP contract, creating both S1 aggregates proves their module
 * migrations and same-module relations can be loaded together.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    let publishableKey: string

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
          salesChannelsData: [{ name: "S1 module integration storefront" }],
        },
      })
      const { result: apiKeys } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "S1 module integration publishable key",
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

    it("loads S1 migrations and exposes only the public artisan contract", async () => {
      const container = getContainer()
      const artisanService = container.resolve(
        ARTISAN_PROFILE_MODULE
      ) as ArtisanProfileService
      const customOrderService = container.resolve(
        CUSTOM_ORDER_MODULE
      ) as CustomOrderService

      const profile = await artisanService.createArtisanProfiles({
        store_id: "store-s1-integration",
        artisan_user_id: "user-private-s1-integration",
        display_name: "S1 Integration Artisan",
        bio: "Public biography",
        verification_status: "approved",
      })
      const order = await customOrderService.createCustomOrderWithHistory({
        artisan_id: profile.id,
        customer_id: "customer-s1-integration",
        title: "Integration custom order",
        product_category: "custom",
        description: "Verifies custom-order tables and status history",
        budget_amount: 680,
        currency_code: "cny",
        actor: {
          actor_type: "customer",
          actor_id: "customer-s1-integration",
        },
      })
      const histories = await customOrderService.listCustomOrderStatusHistories({
        custom_order_id: order.id,
      })

      expect(histories).toHaveLength(1)
      expect(histories[0]).toMatchObject({
        from_status: null,
        to_status: "request",
        actor_type: "customer",
      })

      const response = await api.get("/store/artisans", {
        headers: { "x-publishable-api-key": publishableKey },
      })

      expect(response.status).toBe(200)
      expect(response.data.artisan_profiles).toContainEqual(
        expect.objectContaining({
          id: profile.id,
          store_id: "store-s1-integration",
          display_name: "S1 Integration Artisan",
          bio: "Public biography",
        })
      )
      const publicProfile = response.data.artisan_profiles.find(
        (item: { id: string }) => item.id === profile.id
      )
      expect(publicProfile).not.toHaveProperty("artisan_user_id")
      expect(publicProfile).not.toHaveProperty("version")
      expect(publicProfile).not.toHaveProperty("verification_status")
    })
  },
})
