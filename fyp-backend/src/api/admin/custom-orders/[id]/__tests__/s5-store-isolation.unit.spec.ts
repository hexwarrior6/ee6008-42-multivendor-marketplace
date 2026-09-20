import { GET as GET_TALKJS } from "../talkjs/route"

const order = {
  id: "cor-1",
  customer_id: "cus-1",
  artisan_id: "art-1",
  title: "Engraved compass",
}

const artisanProfile = {
  id: "art-1",
  display_name: "Artisan of store-1",
  store_id: "store-1",
  artisan_user_id: null,
}

const response = () => {
  const res = {
    json: jest.fn(() => res),
    status: jest.fn(() => res),
    sendStatus: jest.fn(() => res),
  }
  return { res }
}

const adminReq = (
  actorId: string,
  options: {
    ownedStores?: string[]
    roles?: string[]
    superAdmin?: boolean
    artisanProfile?: Record<string, unknown>
  } = {}
) => {
  const ownedStores = options.ownedStores ?? []
  const profile = { ...artisanProfile, ...options.artisanProfile }
  return {
    auth_context: { actor_type: "user", actor_id: actorId },
    params: { id: "cor-1" },
    query: {},
    scope: {
      resolve: (key: string) => {
        if (key === "custom_order") {
          return {
            retrieveCustomOrderRequest: jest.fn().mockResolvedValue(order),
            listAndCountCustomOrderMessages: jest
              .fn()
              .mockResolvedValue([[], 0]),
          }
        }
        if (key === "artisan_profile") {
          return {
            retrieveArtisanProfile: jest.fn().mockResolvedValue(profile),
          }
        }
        if (key === "customer") {
          return {
            retrieveCustomer: jest.fn().mockResolvedValue({
              id: "cus-1",
              first_name: "Buyer",
              email: "buyer@example.com",
            }),
          }
        }
        if (key === "user") {
          return {
            retrieveUser: jest.fn().mockResolvedValue({
              roles: options.roles ?? [],
              metadata: options.superAdmin ? { is_super_admin: true } : {},
            }),
          }
        }
        if (key === "query") {
          return {
            graph: jest.fn().mockResolvedValue({
              data: ownedStores.map((storeId) => ({ store_id: storeId })),
            }),
          }
        }
        return undefined
      },
    },
  } as never
}

/**
 * S5 regression: the S3 live chat sessions were exercised through a super
 * admin account. These tests prove the same endpoints keep ordinary sellers
 * inside their own store boundary: a seller who owns store-2 cannot obtain
 * the TalkJS conversation of an order assigned to store-1, while the
 * assigned seller and a platform admin can.
 */
describe("S5 store isolation on the admin custom-order TalkJS endpoint", () => {
  const originalAppId = process.env.TALKJS_APP_ID
  const originalSecret = process.env.TALKJS_SECRET_KEY

  beforeEach(() => {
    // Authorization is checked before any TalkJS work, so the tests can run
    // without credentials. The allowed cases fail later on configuration,
    // which still proves they passed the authorization gate.
    delete process.env.TALKJS_APP_ID
    delete process.env.TALKJS_SECRET_KEY
  })

  afterEach(() => {
    process.env.TALKJS_APP_ID = originalAppId
    process.env.TALKJS_SECRET_KEY = originalSecret
    jest.restoreAllMocks()
  })

  it("denies a seller whose store is not assigned to the order", async () => {
    await expect(
      GET_TALKJS(adminReq("seller-2", { ownedStores: ["store-2"] }), response().res as never)
    ).rejects.toMatchObject({
      type: "forbidden",
      message: expect.stringContaining("not assigned to your store"),
    })
  })

  it("admits a seller who owns the artisan's store past the authorization gate", async () => {
    await expect(
      GET_TALKJS(adminReq("seller-1", { ownedStores: ["store-1"] }), response().res as never)
    ).rejects.toThrow("TalkJS is not configured")
  })

  it("admits the explicitly assigned artisan user even across stores", async () => {
    // The order's artisan profile is assigned to this specific user, so the
    // explicit link wins over the store mismatch.
    const req = adminReq("artisan-user-1", {
      ownedStores: ["store-2"],
      artisanProfile: { artisan_user_id: "artisan-user-1" },
    })

    await expect(
      GET_TALKJS(req, response().res as never)
    ).rejects.toThrow("TalkJS is not configured")
  })

  it("admits a platform administrator past the authorization gate", async () => {
    await expect(
      GET_TALKJS(adminReq("admin-1", { superAdmin: true }), response().res as never)
    ).rejects.toThrow("TalkJS is not configured")
  })
})
