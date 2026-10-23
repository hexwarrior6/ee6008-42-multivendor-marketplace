import { aggregateCustomPayments } from "../payment-analytics"
const order = {
  id: "cor-1",
  status: "confirmed",
  payment_status: "captured",
  version: 1,
  quoted_amount: 680,
  currency_code: "cny",
  metadata: { __custom_order_payment_collection_id: "pay_col_1" },
}
const config = {
  mode: "live" as const,
  appId: "app-1",
  merchantId: "merchant-1",
}
const ledger = () => ({
  id: "pay_col_1",
  amount: 6.8,
  currency_code: "cny",
  captured_amount: 6.8,
  refunded_amount: 0,
  metadata: { custom_order_id: order.id },
  payment_sessions: [],
  payments: [
    {
      id: "pay-1",
      amount: 6.8,
      currency_code: "cny",
      provider_id: "pp_wechat_wechat",
      captured_at: new Date(),
      captures: [{ amount: 6.8 }],
      refunds: [],
      payment_session: { id: "session-1" },
      data: {
        mock: false,
        trade_state: "SUCCESS",
        appid: "app-1",
        mchid: "merchant-1",
        transaction_id: "transaction-1",
        session_id: "session-1",
        attach: "session-1",
        amount: { total: 680, currency: "CNY" },
      },
    },
  ],
})
describe("verified custom capture snapshot", () => {
  it("counts only matching live receipts, not the order's manual captured marker", () => {
    expect(aggregateCustomPayments([{ order }], config)).toMatchObject({
      verified_capture_amount: 0,
      unverified_orders: 1,
    })
    expect(
      aggregateCustomPayments(
        [{ order, collection: ledger() as never }],
        config
      )
    ).toMatchObject({
      verified_capture_amount: 6.8,
      verified_orders: 1,
      excluded_orders: 0,
    })
  })
  it("excludes mock captures and reports the excluded count", () => {
    const collection = ledger()
    collection.payments[0].data.mock = true
    expect(
      aggregateCustomPayments(
        [{ order, collection: collection as never }],
        config
      )
    ).toMatchObject({
      verified_capture_amount: 0,
      simulated_orders: 1,
      excluded_orders: 1,
    })
  })
  it("does not present refunded or mismatched records as settled revenue", () => {
    const collection = ledger()
    collection.refunded_amount = 1
    expect(
      aggregateCustomPayments(
        [{ order, collection: collection as never }],
        config
      ).review_required_orders
    ).toBe(1)
    collection.amount = 1
    expect(
      aggregateCustomPayments(
        [{ order, collection: collection as never }],
        config
      ).verified_capture_amount
    ).toBe(0)
  })
  it("fails closed when merchant configuration is unavailable", () => {
    expect(
      aggregateCustomPayments([{ order, collection: ledger() as never }])
        .review_required_orders
    ).toBe(1)
  })
})
