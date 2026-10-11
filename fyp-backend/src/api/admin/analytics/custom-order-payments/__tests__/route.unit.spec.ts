jest.mock("../../custom-orders/route", () => ({
  customOrderAnalyticsScope: jest.fn(),
}))
jest.mock("../../../../utils/custom-order-payments", () => ({
  customPaymentConfig: jest.fn(() => ({ mode: "mock" })),
  paymentLedger: jest.fn(),
}))
import { GET } from "../route"
import { customOrderAnalyticsScope } from "../../custom-orders/route"
import { paymentLedger } from "../../../../utils/custom-order-payments"
const scope = customOrderAnalyticsScope as jest.Mock
const load = paymentLedger as jest.Mock
const order = {
  id: "cor-1",
  status: "confirmed",
  payment_status: "captured",
  quoted_amount: 680,
  currency_code: "cny",
  version: 1,
  metadata: { __custom_order_payment_collection_id: "pay_col_1" },
}
function setup(rows = [order], count = rows.length) {
  const list = jest.fn(async (_filter: unknown, _config: unknown) => [
    rows,
    count,
  ])
  const res = { json: jest.fn() }
  const req = {
    query: {},
    scope: {
      resolve: (key: string) =>
        key === "custom_order" ? { listAndCountCustomOrderRequests: list } : {},
    },
  } as never
  return { req, res, list }
}
beforeEach(() => {
  jest.clearAllMocks()
  scope.mockResolvedValue({
    from: new Date("2026-10-01T00:00:00Z"),
    to: new Date("2026-10-09T23:59:59.999Z"),
    currencyCode: "cny",
    artisanIds: ["artisan-owned"],
  })
  load.mockResolvedValue({
    id: "pay_col_1",
    amount: 6.8,
    currency_code: "cny",
    metadata: { custom_order_id: "cor-1" },
    payment_sessions: [{ data: { mock: true } }],
    payments: [],
  })
})
describe("custom capture analytics endpoint", () => {
  it("reuses the authorized artisan scope and excludes simulated payments", async () => {
    const h = setup()
    await GET(h.req, h.res as never)
    expect(h.list.mock.calls[0][0]).toMatchObject({
      artisan_id: ["artisan-owned"],
      currency_code: "cny",
    })
    expect(h.res.json.mock.calls[0][0]).toMatchObject({
      financial_report: false,
      amount_unit: "major",
      complete: true,
      summary: { verified_capture_amount: 0, simulated_orders: 1 },
    })
  })
  it("returns an explicitly incomplete report when ledger reads fail", async () => {
    load.mockRejectedValue(Error("unavailable"))
    const h = setup()
    await GET(h.req, h.res as never)
    expect(h.res.json.mock.calls[0][0]).toMatchObject({
      complete: false,
      ledger_unavailable_orders: 1,
      summary: { verified_capture_amount: 0 },
    })
  })
  it("does not hide the capped sample as a complete total", async () => {
    const h = setup([order], 201)
    await GET(h.req, h.res as never)
    expect(h.res.json.mock.calls[0][0]).toMatchObject({
      complete: false,
      truncated: true,
      matched_orders: 201,
    })
  })
  it("rejects unauthorized scope before loading any ledger data", async () => {
    scope.mockRejectedValue(Error("forbidden"))
    const h = setup()
    await expect(GET(h.req, h.res as never)).rejects.toThrow("forbidden")
    expect(h.list).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })
  it("returns empty results without listing orders when no artisans are accessible", async () => {
    scope.mockResolvedValue({
      from: new Date(),
      to: new Date(),
      currencyCode: "cny",
      artisanIds: [],
    })
    const h = setup()
    await GET(h.req, h.res as never)
    expect(h.list).not.toHaveBeenCalled()
    expect(h.res.json.mock.calls[0][0].scanned_orders).toBe(0)
  })
})
