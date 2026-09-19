import { GET, POST } from "../route"
import { POST as POST_MESSAGE } from "../[id]/messages/route"

const response = () => {
  const result: Record<string, unknown> = {}
  const res = {
    json: jest.fn((payload) => {
      result.payload = payload
      return res
    }),
    status: jest.fn(() => res),
  }
  return { res, result }
}

const reqWith = (body: Record<string, unknown>, service: Record<string, unknown>) =>
  ({
    auth_context: { actor_type: "customer", actor_id: "customer-auth" },
    body,
    query: {},
    scope: {
      resolve: (key: string) => {
        if (key === "custom_order") return service
        if (key === "artisan_profile") {
          return {
            retrieveArtisanProfile: jest.fn().mockResolvedValue({
              id: "art-1",
              verification_status: "approved",
            }),
          }
        }
        if (key === "link") {
          return {
            create: jest.fn().mockResolvedValue(undefined),
            dismiss: jest.fn().mockResolvedValue(undefined),
          }
        }
        return undefined
      },
    },
  } as never)

const messageReqWith = (
  body: Record<string, unknown>,
  service: Record<string, unknown>
) =>
  ({
    auth_context: { actor_type: "customer", actor_id: "customer-auth" },
    params: { id: "cor-1" },
    body,
    query: {},
    scope: {
      resolve: (key: string) => key === "custom_order" ? service : undefined,
    },
  } as never)

describe("store custom-order routes", () => {
  it("lists only orders owned by the authenticated customer", async () => {
    const service = {
      listAndCountCustomOrderRequests: jest.fn().mockResolvedValue([
        [{ id: "cor-1", customer_id: "customer-auth" }],
        1,
      ]),
    }
    const { res, result } = response()
    await GET(reqWith({}, service), res as never)

    expect(service.listAndCountCustomOrderRequests).toHaveBeenCalledWith(
      { customer_id: "customer-auth" },
      expect.objectContaining({ take: 20, skip: 0 })
    )
    expect(result.payload).toMatchObject({ count: 1, has_more: false })
  })

  it("ignores a spoofed customer_id when creating an order", async () => {
    const service = {
      createCustomOrderWithHistory: jest.fn().mockResolvedValue({ id: "cor-1" }),
    }
    const { res, result } = response()
    await POST(
      reqWith(
        {
          artisan_id: "art-1",
          customer_id: "customer-spoof",
          title: "Custom coat",
          description: "A coat made to measure",
          product_category: "coat",
        },
        service
      ),
      res as never
    )

    expect(service.createCustomOrderWithHistory).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: "customer-auth" })
    )
    expect(result.payload).toEqual({ custom_order: { id: "cor-1" } })
  })

  it("derives chat sender identity from the authenticated customer", async () => {
    const service = {
      retrieveCustomOrderRequest: jest.fn().mockResolvedValue({
        id: "cor-1",
        customer_id: "customer-auth",
        artisan_id: "art-1",
      }),
      createCustomOrderMessages: jest.fn().mockResolvedValue({ id: "com-1" }),
    }
    const { res } = response()
    await POST_MESSAGE(
      messageReqWith(
        {
          sender_type: "admin",
          sender_id: "admin-spoof",
          message: "Hello",
        },
        service
      ),
      res as never
    )

    expect(service.createCustomOrderMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_type: "customer",
        sender_id: "customer-auth",
      })
    )
  })
})
