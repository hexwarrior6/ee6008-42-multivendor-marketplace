import { GET as GET_DETAIL, PATCH } from "../[id]/route"
import { GET as GET_TALKJS } from "../[id]/talkjs/route"

const order = {
  id: "cor-1",
  customer_id: "customer-auth",
  artisan_id: "art-1",
  title: "Engraved compass",
  status: "request",
}

const response = () => {
  const result: Record<string, unknown> = {}
  const res = {
    json: jest.fn((payload) => {
      result.payload = payload
      return res
    }),
    status: jest.fn(() => res),
    sendStatus: jest.fn(() => res),
  }
  return { res, result }
}

const customerReq = (auth: Record<string, unknown>, body?: unknown) =>
  ({
    auth_context: auth,
    params: { id: "cor-1" },
    ...(body === undefined ? {} : { body }),
    query: {},
    scope: {
      resolve: (key: string) => {
        if (key === "custom_order") {
          return {
            retrieveCustomOrderRequest: jest.fn().mockResolvedValue(order),
            listAndCountCustomOrderMessages: jest
              .fn()
              .mockResolvedValue([[], 0]),
            updateCustomOrderAtomically: jest
              .fn()
              .mockResolvedValue({ ...order, version: 1 }),
          }
        }
        if (key === "artisan_profile") {
          return {
            retrieveArtisanProfile: jest.fn().mockResolvedValue({
              id: "art-1",
              display_name: "Artisan",
              store_id: "store-1",
            }),
          }
        }
        if (key === "customer") {
          return {
            retrieveCustomer: jest.fn().mockResolvedValue({
              id: "customer-auth",
              first_name: "Buyer",
              last_name: null,
              email: "buyer@example.com",
            }),
          }
        }
        return undefined
      },
    },
  } as never)

/**
 * S5 regression: a buyer can read their own order and update only its
 * metadata. Everything that drives the workflow — status, quote, payment —
 * must stay server-controlled, and another customer must not even be able to
 * open the TalkJS session of an order they do not own.
 */
describe("S5 customer guards on the storefront custom-order API", () => {
  it("lets the owner read the order but blocks another customer", async () => {
    const { res } = response()
    await GET_DETAIL(
      customerReq({ actor_type: "customer", actor_id: "customer-auth" }),
      res as never
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ custom_order: order })
    )

    await expect(
      GET_DETAIL(
        customerReq({ actor_type: "customer", actor_id: "customer-other" }),
        response().res as never
      )
    ).rejects.toMatchObject({
      type: "forbidden",
      message: expect.stringContaining("own custom orders"),
    })
  })

  it("rejects a customer status or quote change through PATCH", async () => {
    for (const body of [
      { status: "confirmed" },
      { quoted_amount: 500 },
      { payment_status: "captured" },
      { listing_type: "product", product_id: "prod-1" },
    ]) {
      await expect(
        PATCH(
          customerReq({ actor_type: "customer", actor_id: "customer-auth" }, body),
          response().res as never
        )
      ).rejects.toMatchObject({
        type: "not_allowed",
      })
    }
  })

  it("still allows a metadata-only update for the owner", async () => {
    const service = {
      retrieveCustomOrderRequest: jest.fn().mockResolvedValue(order),
      updateCustomOrderAtomically: jest
        .fn()
        .mockResolvedValue({ ...order, metadata: { gift: true } }),
    }
    const req = customerReq({ actor_type: "customer", actor_id: "customer-auth" }, {
      metadata: { gift: true },
    })
    ;(req.scope as { resolve: (key: string) => unknown }).resolve = (
      key: string
    ) => (key === "custom_order" ? service : undefined)

    const { res, result } = response()
    await PATCH(req, res as never)

    expect(service.updateCustomOrderAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cor-1",
        metadata: { gift: true },
        actor: { actor_type: "customer", actor_id: "customer-auth" },
      })
    )
    expect(result.payload).toMatchObject({
      custom_order: { metadata: { gift: true } },
    })
  })

  it("refuses a TalkJS session to a customer who does not own the order", async () => {
    // The route resolves TalkJS credentials from the environment; make sure
    // the assertion fails on authorization before any network call.
    delete process.env.TALKJS_APP_ID
    delete process.env.TALKJS_SECRET_KEY

    await expect(
      GET_TALKJS(
        customerReq({ actor_type: "customer", actor_id: "customer-other" }),
        response().res as never
      )
    ).rejects.toMatchObject({
      type: "forbidden",
      message: expect.stringContaining("own custom orders"),
    })
  })
})
