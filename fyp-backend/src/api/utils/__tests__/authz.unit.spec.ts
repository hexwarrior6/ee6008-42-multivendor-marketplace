import {
  assertCustomOrderAccess,
  getBackofficeAccess,
  requireCustomerContext,
} from "../authz"

const request = (auth_context: Record<string, unknown>, scope: Record<string, unknown>) =>
  ({ auth_context, scope: { resolve: (key: string) => scope[key] } } as never)

describe("S1 authorization boundaries", () => {
  it("requires a customer actor for storefront customer APIs", () => {
    expect(() =>
      requireCustomerContext(
        request({ actor_type: "user", actor_id: "seller-1" }, {})
      )
    ).toThrow("customer account")
  })

  it("does not allow a customer to read another customer's order", async () => {
    await expect(
      assertCustomOrderAccess(
        request({ actor_type: "customer", actor_id: "customer-2" }, {}),
        { customer_id: "customer-1", artisan_id: "art-1" },
        { allowBackoffice: false }
      )
    ).rejects.toThrow("own custom orders")
  })

  it("honors an explicit artisan assignment within a shared store", async () => {
    const artisanService = {
      retrieveArtisanProfile: jest.fn().mockResolvedValue({
        id: "art-1",
        store_id: "store-1",
        artisan_user_id: "artisan-1",
      }),
    }
    const query = {
      graph: jest.fn().mockResolvedValue({
        data: [{ store_id: "store-1" }],
      }),
    }
    const userModule = {
      retrieveUser: jest.fn().mockResolvedValue({ roles: ["seller"] }),
    }
    await expect(
      assertCustomOrderAccess(
        request(
          { actor_type: "user", actor_id: "artisan-2" },
          {
            artisan_profile: artisanService,
            query,
            user: userModule,
          }
        ),
        { customer_id: "customer-1", artisan_id: "art-1" }
      )
    ).rejects.toThrow("not assigned")
  })

  it("fails closed when a seller has no store assignment", async () => {
    await expect(
      getBackofficeAccess(
        request(
          { actor_type: "user", actor_id: "seller-without-store" },
          {
            user: { retrieveUser: jest.fn().mockResolvedValue({ roles: ["seller"] }) },
            query: { graph: jest.fn().mockResolvedValue({ data: [] }) },
          }
        )
      )
    ).rejects.toThrow("owned store")
  })

  it("fails closed for a user with neither a trusted role nor a store", async () => {
    await expect(
      getBackofficeAccess(
        request(
          { actor_type: "user", actor_id: "unclassified-user" },
          {
            user: { retrieveUser: jest.fn().mockResolvedValue({}) },
            query: { graph: jest.fn().mockResolvedValue({ data: [] }) },
          }
        )
      )
    ).rejects.toThrow("trusted platform administrator role or an owned store")
  })

  it("does not treat client-controlled user metadata as an admin role", async () => {
    await expect(
      getBackofficeAccess(
        request(
          {
            actor_type: "user",
            actor_id: "user-metadata-admin",
            user_metadata: { is_admin: true },
          },
          {
            user: { retrieveUser: jest.fn().mockResolvedValue({}) },
            query: { graph: jest.fn().mockResolvedValue({ data: [] }) },
          }
        )
      )
    ).rejects.toThrow("trusted platform administrator role or an owned store")
  })

  it("fails closed when the store ownership lookup fails", async () => {
    await expect(
      getBackofficeAccess(
        request(
          { actor_type: "user", actor_id: "seller-query-fails" },
          {
            user: { retrieveUser: jest.fn().mockResolvedValue({ roles: ["seller"] }) },
            query: { graph: jest.fn().mockRejectedValue(new Error("link unavailable")) },
          }
        )
      )
    ).rejects.toThrow("could not be verified")
  })

  it("recognizes only an explicit super-admin marker without stores", async () => {
    const access = await getBackofficeAccess(
      request(
        { actor_type: "user", actor_id: "super-admin" },
        {
          user: {
            retrieveUser: jest.fn().mockResolvedValue({
              metadata: { is_super_admin: true },
            }),
          },
          query: { graph: jest.fn().mockResolvedValue({ data: [] }) },
        }
      )
    )

    expect(access.isPlatformAdmin).toBe(true)
  })
})
