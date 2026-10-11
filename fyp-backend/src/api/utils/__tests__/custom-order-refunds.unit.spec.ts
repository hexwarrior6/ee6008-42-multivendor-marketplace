jest.mock("../authz", () => ({
  getBackofficeAccess: jest.fn(),
  assertCustomOrderAccess: jest.fn(),
}))
jest.mock("../custom-order-payments", () => ({
  ...jest.requireActual("../custom-order-payments"),
  customPaymentConfig: jest.fn(),
}))
jest.mock("../../../modules/wechat-pay/client", () => ({
  ...jest.requireActual("../../../modules/wechat-pay/client"),
  WeChatPayClient: jest.fn(),
}))
import { getBackofficeAccess } from "../authz"
import { customPaymentConfig } from "../custom-order-payments"
import { WeChatPayClient } from "../../../modules/wechat-pay/client"
import { CustomOrderService } from "../../../modules/custom-order/service"
import {
  fullRefundReference,
  paymentOperation,
} from "../../../modules/custom-order/payment-operation"
import {
  customRefundConfig,
  protectCustomRefund,
  refundCustomOrder,
} from "../custom-order-refunds"
const access = getBackofficeAccess as jest.Mock
const config = customPaymentConfig as jest.Mock
const Client = WeChatPayClient as jest.Mock
const settings = {
  mode: "live" as const,
  appId: "app-1",
  merchantId: "merchant-1",
  apiBaseUrl: "https://example.test",
}
const context = { transactionManager: {} } as never
const originalEnv = { ...process.env }
function fixture(live = false) {
  let order: any = {
    id: "cor-1",
    customer_id: "customer-1",
    status: "confirmed",
    payment_status: "pending",
    version: 3,
    quoted_amount: 680,
    currency_code: "cny",
    metadata: { __custom_order_payment_collection_id: "pay_col_1" },
  }
  const collection: any = {
    id: "pay_col_1",
    amount: 6.8,
    currency_code: "cny",
    captured_amount: 6.8,
    refunded_amount: 0,
    metadata: { custom_order_id: "cor-1" },
    payment_sessions: [],
    payments: [
      {
        id: "pay-1",
        amount: 6.8,
        currency_code: "cny",
        provider_id: "pp_wechat_wechat",
        captured_at: new Date(),
        payment_session: { id: "session-1" },
        captures: [{ id: "capture-1", amount: 6.8 }],
        refunds: [],
        data: {
          mock: !live,
          amount_fen: 680,
          trade_state: "SUCCESS",
          appid: "app-1",
          mchid: "merchant-1",
          transaction_id: "transaction-1",
          out_trade_no: "HM_ORDER",
          session_id: "session-1",
          attach: "session-1",
          amount: { total: 680, currency: "CNY" },
        },
      },
    ],
  }
  const history = jest.fn()
  const retrieve = jest.fn(async () => order)
  const service: any = Object.assign(
    Object.create(CustomOrderService.prototype),
    {
      retrieveCustomOrderRequest: retrieve,
      updateCustomOrderRequests: jest.fn(
        async (data) => (order = { ...order, ...data })
      ),
      createCustomOrderStatusHistories: history,
    }
  )
  service.beginPaymentOperation = (input: unknown) =>
    CustomOrderService.prototype.beginPaymentOperation.call(
      service,
      input as never,
      context
    )
  service.executePaymentOperation = (
    id: string,
    operation: string,
    work: never
  ) =>
    CustomOrderService.prototype.executePaymentOperation.call(
      service,
      id,
      operation,
      work,
      context
    )
  const payment = {
    retrievePaymentCollection: jest.fn(async () => collection),
    retrievePayment: jest.fn(async () => ({
      payment_collection_id: collection.id,
    })),
    updatePayment: jest.fn(async (data) =>
      Object.assign(collection.payments[0], data)
    ),
    refundPayment: jest.fn(async () => {
      collection.payments[0].refunds = [{ id: "refund-1", amount: 6.8 }]
      collection.refunded_amount = 6.8
      Object.assign(collection.payments[0].data, {
        out_refund_no: fullRefundReference(order),
        refund_status: "SUCCESS",
      })
      return collection.payments[0]
    }),
  }
  const providerReceipt = {
    refund_id: "wechat-refund-1",
    out_refund_no: fullRefundReference(order),
    out_trade_no: "HM_ORDER",
    transaction_id: "transaction-1",
    status: "SUCCESS",
    amount: { total: 680, refund: 680, currency: "CNY" },
  }
  const provider = {
    queryRefund: jest.fn(async (_reference: string) => providerReceipt),
    queryOrder: jest.fn(),
    refund: jest.fn(),
  }
  Client.mockImplementation(() => provider)
  config.mockReturnValue(
    live ? settings : { mode: "mock", apiBaseUrl: "https://example.test" }
  )
  const req: any = {
    params: { id: order.id },
    body: {
      version: 3,
      reason: "Buyer requested cancellation before production",
    },
    scope: {
      resolve: (key: string) => (key === "custom_order" ? service : payment),
    },
  }
  return {
    req,
    service,
    payment,
    collection,
    provider,
    providerReceipt,
    history,
    retrieve,
    current: () => order,
  }
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.CUSTOM_ORDER_LIVE_REFUNDS_ENABLED = "true"
  access.mockResolvedValue({
    isPlatformAdmin: true,
    context: { actor_id: "admin-1" },
  })
})
afterEach(() => {
  process.env = { ...originalEnv }
})
describe("platform-only pre-production full refunds", () => {
  it("completes a simulated refund once and never labels it real", async () => {
    const h = fixture()
    const result = await refundCustomOrder(h.req)
    expect(result.refund).toMatchObject({
      status: "completed",
      mode: "mock",
      verification: "simulated_refund",
    })
    expect(h.current().status).toBe("cancelled")
    expect(
      h.current().metadata.__custom_order_payment_refund_verification
    ).toBe("simulated_refund")
    expect(h.current().payment_status).toBe("pending")
    await refundCustomOrder(h.req)
    expect(h.payment.refundPayment).toHaveBeenCalledTimes(1)
    expect(h.history).toHaveBeenCalledTimes(1)
    expect(Client).not.toHaveBeenCalled()
  })
  it("rejects sellers/customers before reading order details", async () => {
    const h = fixture()
    access.mockResolvedValue({
      isPlatformAdmin: false,
      context: { actor_id: "seller" },
    })
    await expect(refundCustomOrder(h.req)).rejects.toMatchObject({
      type: "forbidden",
    })
    expect(h.retrieve).not.toHaveBeenCalled()
  })
  it.each(["request", "quote", "produced", "delivered", "cancelled"])(
    "rejects %s orders",
    async (status) => {
      const h = fixture()
      h.current().status = status
      await expect(refundCustomOrder(h.req)).rejects.toMatchObject({
        type: "not_allowed",
      })
      expect(h.payment.refundPayment).not.toHaveBeenCalled()
    }
  )
  it.each([
    { amount: 1 },
    { provider_id: "foreign" },
    { refund_reference: "foreign" },
  ])("rejects injected refund fields %j", async (fields) => {
    const h = fixture()
    Object.assign(h.req.body, fields)
    await expect(refundCustomOrder(h.req)).rejects.toMatchObject({
      type: "invalid_data",
    })
    expect(h.payment.refundPayment).not.toHaveBeenCalled()
  })
  it("refuses stale versions without creating an intent", async () => {
    const h = fixture()
    h.req.body.version = 2
    await expect(refundCustomOrder(h.req)).rejects.toMatchObject({
      type: "conflict",
    })
    expect(paymentOperation(h.current())).toBeUndefined()
  })
  it("refuses partial captures or pre-existing foreign refunds", async () => {
    const h = fixture()
    h.collection.captured_amount = 1
    await expect(refundCustomOrder(h.req)).rejects.toThrow("fully captured")
    h.collection.captured_amount = 6.8
    h.collection.payments[0].refunds = [{ id: "foreign", amount: 1 }]
    await expect(refundCustomOrder(h.req)).rejects.toThrow("review")
  })
  it("enforces the closed live switch before any intent or provider request", async () => {
    const h = fixture(true)
    process.env.CUSTOM_ORDER_LIVE_REFUNDS_ENABLED = "false"
    expect(() => customRefundConfig()).toThrow("separate")
    await expect(refundCustomOrder(h.req)).rejects.toThrow("enablement")
    expect(Client).not.toHaveBeenCalled()
    expect(paymentOperation(h.current())).toBeUndefined()
  })
  it("keeps PROCESSING pending, throttles queries and cancels only after SUCCESS", async () => {
    const h = fixture(true)
    h.providerReceipt.status = "PROCESSING"
    const first = await refundCustomOrder(h.req)
    expect(first.refund?.status).toBe("provider_pending")
    expect(h.current().status).toBe("confirmed")
    expect(h.payment.refundPayment).not.toHaveBeenCalled()
    const version = h.current().version
    await refundCustomOrder(h.req)
    expect(h.provider.queryRefund).toHaveBeenCalledTimes(1)
    expect(h.current().version).toBe(version)
    h.current().metadata.__custom_order_payment_operation.next_check_at =
      new Date(0).toISOString()
    h.providerReceipt.status = "SUCCESS"
    const final = await refundCustomOrder(h.req)
    expect(final.refund?.verification).toBe("verified_refund")
    expect(h.current().status).toBe("cancelled")
    expect(h.payment.refundPayment).toHaveBeenCalledTimes(1)
    expect(h.provider.refund).not.toHaveBeenCalled()
  })
  it("preserves intent on failure and resumes using the frozen reference", async () => {
    const h = fixture(true)
    h.provider.queryRefund.mockRejectedValueOnce(Error("ambiguous connection"))
    await expect(refundCustomOrder(h.req)).rejects.toThrow("ambiguous")
    const operation = paymentOperation(h.current())!
    expect(operation.status).toBe("requested")
    await refundCustomOrder(h.req)
    expect(
      h.provider.queryRefund.mock.calls.every(
        (args) => args[0] === operation.refund_reference
      )
    ).toBe(true)
    expect(h.payment.refundPayment).toHaveBeenCalledTimes(1)
  })
  it("blocks generic admin refunds for custom collections but leaves normal payments alone", async () => {
    const h = fixture()
    const next = jest.fn()
    await expect(protectCustomRefund(h.req, {}, next)).rejects.toMatchObject({
      type: "forbidden",
    })
    expect(next).not.toHaveBeenCalled()
    h.collection.metadata = {}
    await protectCustomRefund(h.req, {}, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
