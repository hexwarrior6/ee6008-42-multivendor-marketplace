import { CustomOrderService } from "../service"
import {
  PAYMENT_BINDING_KEY,
  PAYMENT_VERIFICATION_KEY,
  verifyCustomOrderPayment,
  assertNoPaymentBindingInput,
} from "../payment"

const order = {
  id: "cor-1",
  customer_id: "customer-1",
  status: "confirmed",
  payment_status: "pending",
  version: 5,
  quoted_amount: 680,
  currency_code: "cny",
  metadata: { [PAYMENT_BINDING_KEY]: "pay_col_123" },
}
const config = {
  mode: "live" as const,
  appId: "app-1",
  merchantId: "merchant-1",
}
const ledger = () => ({
  id: "pay_col_123",
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
      canceled_at: null,
      captured_at: new Date(),
      payment_session: { id: "payses-1" },
      captures: [{ id: "cap-1", amount: 6.8 }],
      refunds: [],
      data: {
        mock: false,
        trade_state: "SUCCESS",
        appid: "app-1",
        mchid: "merchant-1",
        transaction_id: "txn-1",
        session_id: "payses-1",
        attach: "payses-1",
        amount: { total: 680, currency: "CNY" },
      },
    },
  ],
})
const verify = (collection: unknown, settings: unknown = config) =>
  verifyCustomOrderPayment(order, collection as never, settings as never)

describe("trusted custom-order payment verification", () => {
  it("accepts a full captured server ledger with a matching live merchant receipt", () => {
    expect(verify(ledger())).toEqual({
      verification: "verified",
      receipt_id: "pay-1",
    })
  })
  it.each(["mock", "disabled"])(
    "never accepts a live-looking record while configuration is %s",
    (mode) => {
      expect(
        verify(ledger(), mode === "mock" ? { mode: "mock" } : null).verification
      ).toBe("review_required")
    }
  )
  it.each(["mock", "manual"])(
    "does not treat %s payment records as real receipts",
    (kind) => {
      const collection = ledger()
      if (kind === "mock") collection.payments[0].data.mock = true
      else collection.payments[0].provider_id = "pp_system_default"
      expect(verify(collection).verification).toBe("simulated")
    }
  )
  it.each([
    { appid: "foreign" },
    { mchid: "foreign" },
    { trade_state: "NOTPAY" },
    { transaction_id: "" },
    { session_id: "foreign" },
    { attach: "foreign" },
    { amount: { total: 1, currency: "CNY" } },
    { amount: { total: 680, currency: "USD" } },
  ])("rejects mismatched receipt details %j", (data) => {
    const collection = ledger()
    Object.assign(collection.payments[0].data, data)
    expect(verify(collection).verification).toBe("review_required")
  })
  it.each([0, 1, 6.79, 6.81])(
    "does not authorize production from capture amount %s",
    (amount) => {
      const collection = ledger()
      collection.payments[0].captures[0].amount = amount
      collection.captured_amount = amount
      expect(verify(collection).verification).not.toBe("verified")
    }
  )
  it("does not accept an authorization without captures", () => {
    const collection = ledger()
    collection.payments[0].captures = []
    collection.captured_amount = 0
    expect(verify(collection).verification).toBe("unverified")
  })
  it("requires administrator review after a refund", () => {
    const collection = ledger()
    collection.refunded_amount = 1
    expect(verify(collection).verification).toBe("review_required")
  })
  it.each([
    { id: "pay_col_foreign" },
    { amount: 1 },
    { currency_code: "usd" },
    { metadata: { custom_order_id: "foreign" } },
  ])("refuses another quote/collection %j", (patch) => {
    expect(() => verify({ ...ledger(), ...patch })).toThrow("accepted quote")
  })
  it("does not trust multiple payment attempts as a single verified receipt", () => {
    const collection = ledger()
    collection.payments.push({ ...collection.payments[0], id: "pay-2" })
    expect(verify(collection).verification).toBe("review_required")
  })
  it.each([
    PAYMENT_VERIFICATION_KEY,
    "__custom_order_payment_receipt_id",
    "__custom_order_payment_future",
  ])("reserves all payment proof metadata: %s", (key) => {
    expect(() => assertNoPaymentBindingInput({ [key]: "verified" })).toThrow(
      "server-managed"
    )
  })
  it("reconciles once using a freshly loaded ledger, without changing business status", async () => {
    let current: any = order
    const update = jest.fn(async (data) => (current = { ...current, ...data }))
    const service = Object.assign(Object.create(CustomOrderService.prototype), {
      retrieveCustomOrderRequest: jest.fn(async () => current),
      updateCustomOrderRequests: update,
    }) as CustomOrderService
    const load = jest.fn(async () => ledger() as never)
    const context = { transactionManager: {} } as never
    await service.reconcilePaymentCollection(order.id, load, config, context)
    await service.reconcilePaymentCollection(order.id, load, config, context)
    expect(load).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
    expect(current.status).toBe("confirmed")
    expect(current.payment_status).toBe("captured")
    expect(current.metadata[PAYMENT_VERIFICATION_KEY]).toBe("verified")
    const refunded = ledger()
    refunded.refunded_amount = 1
    await service.reconcilePaymentCollection(
      order.id,
      async () => refunded as never,
      config,
      context
    )
    expect(current.metadata[PAYMENT_VERIFICATION_KEY]).toBe("review_required")
    expect(current.payment_status).toBe("captured")
    await expect(
      service.updateCustomOrderAtomically(
        { id: order.id, status: "produced" },
        context
      )
    ).rejects.toThrow("verified real payment")
  })
  it("does not trust a stale verified marker when starting production", async () => {
    const current = {
      ...order,
      payment_status: "captured",
      metadata: { ...order.metadata, [PAYMENT_VERIFICATION_KEY]: "verified" },
    }
    const update = jest.fn()
    const service = Object.assign(Object.create(CustomOrderService.prototype), {
      retrieveCustomOrderRequest: jest.fn(async () => current),
      updateCustomOrderRequests: update,
    }) as CustomOrderService
    const context = { transactionManager: {} } as never
    const verify = jest.fn(async () => false)
    await expect(
      service.updateCustomOrderAtomically(
        { id: order.id, status: "produced", verify_payment: verify },
        context
      )
    ).rejects.toThrow("verified real payment")
    expect(verify).toHaveBeenCalledWith(current)
    expect(update).not.toHaveBeenCalled()
  })
  it("permits production after a fresh verified ledger check and records the transition", async () => {
    const current = {
      ...order,
      payment_status: "captured",
      metadata: { ...order.metadata, [PAYMENT_VERIFICATION_KEY]: "verified" },
    }
    const update = jest.fn(async () => [{ ...current, status: "produced" }])
    const history = jest.fn()
    const service = Object.assign(Object.create(CustomOrderService.prototype), {
      retrieveCustomOrderRequest: jest.fn(async () => current),
      updateCustomOrderRequests: update,
      createCustomOrderStatusHistories: history,
    }) as CustomOrderService
    await service.updateCustomOrderAtomically(
      { id: order.id, status: "produced", verify_payment: async () => true },
      { transactionManager: {} } as never
    )
    expect(update).toHaveBeenCalledTimes(1)
    expect(history).toHaveBeenCalledWith(
      expect.objectContaining({
        from_status: "confirmed",
        to_status: "produced",
      }),
      expect.any(Object)
    )
  })
})
