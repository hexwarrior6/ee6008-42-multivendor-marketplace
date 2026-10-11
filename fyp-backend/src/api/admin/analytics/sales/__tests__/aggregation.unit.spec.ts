jest.mock("../../../../utils/authz", () => ({
  getBackofficeAccess: jest.fn(),
  securityLog: jest.fn(),
}))
import { GET } from "../route"
import { getBackofficeAccess } from "../../../../utils/authz"

const access = getBackofficeAccess as jest.Mock
const paidOrder = {
  id: "order-1",
  status: "pending",
  currency_code: "cny",
  created_at: "2026-10-05T12:00:00.000Z",
  stores: [{ id: "store-1" }, { id: "store-2" }],
  payment_collections: [{ captured_amount: 1000, refunded_amount: 200 }],
  items: [
    { product_id: "p1", title: "One", quantity: 1, total: 600 },
    { product_id: "p2", title: "Two", quantity: 2, total: 400 },
  ],
}
const setup = (query: Record<string, unknown> = {}, orders = [paidOrder]) => {
  const graph = jest.fn(async ({ entity }) =>
    entity === "order"
      ? { data: orders }
      : {
          data: [
            { product_id: "p1", store_id: "store-1" },
            { product_id: "p2", store_id: "store-2" },
          ],
        }
  )
  const req = {
    query: {
      from: "2026-10-01",
      to: "2026-10-09",
      currency_code: "cny",
      ...query,
    },
    scope: { resolve: () => ({ graph }) },
  } as never
  const res = { json: jest.fn() }
  return { req, res, graph }
}
beforeEach(() =>
  access.mockResolvedValue({
    isPlatformAdmin: true,
    storeIds: [],
    context: { actor_id: "admin-1" },
  })
)

describe("sales analytics endpoint aggregation", () => {
  it("aggregates captured net revenue, paid order count, daily totals and products", async () => {
    const { req, res } = setup()
    await GET(req, res as never)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: { revenue: 800, orders: 1, average_order_value: 800 },
        daily: [{ date: "2026-10-05", orders: 1, revenue: 800 }],
        top_products: [
          { product_id: "p1", title: "One", units: 1, revenue: 480 },
          { product_id: "p2", title: "Two", units: 2, revenue: 320 },
        ],
      })
    )
  })
  it("allocates multi-vendor revenue only to the authenticated seller's lines", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store-1"],
      context: { actor_id: "seller-1" },
    })
    const { req, res, graph } = setup()
    await GET(req, res as never)
    expect(graph.mock.calls[0][0]).toMatchObject({
      filters: { stores: { id: ["store-1"] } },
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: { revenue: 480, orders: 1, average_order_value: 480 },
        top_products: [
          { product_id: "p1", title: "One", units: 1, revenue: 480 },
        ],
      })
    )
  })
  it("rejects cross-store analytics before querying data", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store-1"],
      context: { actor_id: "seller-1" },
    })
    const { req, res, graph } = setup({ store_id: "store-2" })
    await expect(GET(req, res as never)).rejects.toMatchObject({
      type: "not_allowed",
    })
    expect(graph).not.toHaveBeenCalled()
  })
  it.each([
    { from: "invalid" },
    { from: "2026-10-09", to: "2026-10-01" },
    { from: "2024-01-01", to: "2026-10-09" },
  ])("rejects invalid/oversized date ranges %p", async (query) => {
    const { req, res, graph } = setup(query)
    await expect(GET(req, res as never)).rejects.toMatchObject({
      type: "invalid_data",
    })
    expect(graph).not.toHaveBeenCalled()
  })
  it("returns zeros for a seller without store access, without loading orders", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: [],
      context: { actor_id: "seller-1" },
    })
    const { req, res, graph } = setup()
    await GET(req, res as never)
    expect(graph).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: { revenue: 0, orders: 0, average_order_value: 0 },
      })
    )
  })
  it("fails closed when product ownership cannot be resolved", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store-1"],
      context: { actor_id: "seller-1" },
    })
    const { req, res, graph } = setup()
    graph
      .mockResolvedValueOnce({ data: [paidOrder] })
      .mockRejectedValueOnce(new Error("link unavailable"))
    await expect(GET(req, res as never)).rejects.toThrow(
      "ownership could not be verified"
    )
    expect(res.json).not.toHaveBeenCalled()
  })
})
