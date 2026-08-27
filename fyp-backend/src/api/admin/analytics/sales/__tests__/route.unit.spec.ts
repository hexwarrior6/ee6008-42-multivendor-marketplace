import { getOrderNetRevenue } from "../route"

describe("sales analytics revenue filtering", () => {
  it("uses captured amount minus refunds", () => {
    expect(
      getOrderNetRevenue({
        id: "ord-paid",
        total: 1200,
        payment_collections: [
          { status: "captured", captured_amount: 1200, refunded_amount: 200 },
        ],
      })
    ).toBe(1000)
  })

  it.each([
    { status: "pending" },
    { status: "canceled" },
    { status: "failed" },
  ])("excludes $status orders", ({ status }) => {
    expect(
      getOrderNetRevenue({
        id: `ord-${status}`,
        total: 1000,
        status,
        payment_collections: [
          { status: "captured", captured_amount: 1000, refunded_amount: 0 },
        ],
      })
    ).toBe(0)
  })

  it("does not treat order.total as revenue without a paid signal", () => {
    expect(getOrderNetRevenue({ id: "ord-unpaid", total: 1000 })).toBe(0)
    expect(
      getOrderNetRevenue({
        id: "ord-paid-legacy",
        total: 1000,
        payment_status: "captured",
      })
    ).toBe(1000)
  })

  it("handles full refunds as zero net revenue", () => {
    expect(
      getOrderNetRevenue({
        id: "ord-refunded",
        total: 1000,
        payment_collections: [
          { status: "refunded", captured_amount: 1000, refunded_amount: 1000 },
        ],
      })
    ).toBe(0)
  })

  it("does not fall back to order.total for an unquantified refund", () => {
    expect(
      getOrderNetRevenue({
        id: "ord-refunded-legacy",
        total: 1000,
        payment_status: "refunded",
      })
    ).toBe(0)
  })
})
