import { WeChatApiError } from "../client"
import { assertFullRefundReceipt, resolveFullRefund } from "../custom-refund"
import WeChatPayProviderService from "../service"

const expected = {
  reference: `CR${"a".repeat(30)}`,
  outTradeNo: "HM_ORDER",
  transactionId: "transaction-1",
  sessionId: "session-1",
  minorAmount: 680,
  appId: "app-1",
  merchantId: "merchant-1",
}
const receipt = () => ({
  refund_id: "refund-provider-1",
  out_refund_no: expected.reference,
  out_trade_no: expected.outTradeNo,
  transaction_id: expected.transactionId,
  status: "SUCCESS" as const,
  amount: { total: 680, refund: 680, currency: "CNY" },
})
const original = () => ({
  out_trade_no: expected.outTradeNo,
  transaction_id: expected.transactionId,
  attach: expected.sessionId,
  appid: expected.appId,
  mchid: expected.merchantId,
  trade_state: "SUCCESS",
  amount: { total: 680, currency: "CNY" },
})
const client = () => ({
  queryRefund: jest.fn(async () => receipt()),
  queryOrder: jest.fn(async () => original()),
  refund: jest.fn(async () => receipt()),
})
describe("durable full-refund protocol (mocked network only)", () => {
  it("queries an existing successful refund without resubmitting", async () => {
    const api = client()
    expect((await resolveFullRefund(api, expected, "reason")).status).toBe(
      "SUCCESS"
    )
    expect(api.refund).not.toHaveBeenCalled()
    expect(api.queryOrder).not.toHaveBeenCalled()
  })
  it("submits only after a signed not-found response and verified original payment", async () => {
    const api = client()
    api.queryRefund.mockRejectedValueOnce(
      new WeChatApiError("RESOURCE_NOT_EXISTS", 404)
    )
    await resolveFullRefund(api, expected, "reason")
    expect(api.refund).toHaveBeenCalledTimes(1)
    expect(api.refund).toHaveBeenCalledWith({
      out_trade_no: "HM_ORDER",
      out_refund_no: expected.reference,
      reason: "reason",
      amount: { total: 680, refund: 680, currency: "CNY" },
    })
    await resolveFullRefund(api, expected, "reason")
    expect(api.refund).toHaveBeenCalledTimes(1)
  })
  it.each([
    Error("timeout"),
    new WeChatApiError("SYSTEM_ERROR", 500),
    new WeChatApiError("RESOURCE_NOT_EXISTS", 500),
  ])("does not submit on ambiguous query failure", async (error) => {
    const api = client()
    api.queryRefund.mockRejectedValueOnce(error)
    await expect(resolveFullRefund(api, expected, "reason")).rejects.toThrow()
    expect(api.refund).not.toHaveBeenCalled()
    expect(api.queryOrder).not.toHaveBeenCalled()
  })
  it.each([
    { trade_state: "NOTPAY" },
    { appid: "foreign" },
    { mchid: "foreign" },
    { attach: "foreign" },
    { transaction_id: "foreign" },
    { amount: { total: 1, currency: "CNY" } },
  ])("refuses an unverified original payment %j", async (patch) => {
    const api = client()
    api.queryRefund.mockRejectedValueOnce(
      new WeChatApiError("RESOURCE_NOT_EXISTS", 404)
    )
    Object.assign(api, {
      queryOrder: jest.fn(async () => ({ ...original(), ...patch })),
    })
    await expect(resolveFullRefund(api, expected, "reason")).rejects.toThrow(
      "Original provider payment"
    )
    expect(api.refund).not.toHaveBeenCalled()
  })
  it.each([
    { out_refund_no: "foreign" },
    { transaction_id: "foreign" },
    { out_trade_no: "foreign" },
    { refund_id: "" },
    { amount: { total: 680, refund: 1, currency: "CNY" } },
    { amount: { total: 680, refund: 680, currency: "USD" } },
    { status: "CLOSED" },
    { status: "ABNORMAL" },
  ])("rejects mismatched/abnormal refund receipts %j", (patch) => {
    expect(() =>
      assertFullRefundReceipt({ ...receipt(), ...patch } as never, expected)
    ).toThrow()
  })
  it("keeps a processing refund pending instead of treating it as success", async () => {
    const api = client()
    api.queryRefund.mockResolvedValueOnce({
      ...receipt(),
      status: "PROCESSING",
    } as never)
    expect((await resolveFullRefund(api, expected, "reason")).status).toBe(
      "PROCESSING"
    )
    expect(api.refund).not.toHaveBeenCalled()
  })
})

describe("managed Medusa refund mirror", () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
  const input = {
    amount: 6.8,
    data: {
      out_trade_no: expected.outTradeNo,
      transaction_id: expected.transactionId,
      amount_fen: 680,
      __custom_order_refund_reference: expected.reference,
    },
  }
  const live = () =>
    new WeChatPayProviderService({ logger } as never, {
      WECHAT_PAY_MODE: "live",
      WECHAT_PAY_SANDBOX: "false",
      WECHAT_PAY_APP_ID: "app-1",
      WECHAT_PAY_MCH_ID: "merchant-1",
      WECHAT_PAY_API_V3_KEY: "1".repeat(32),
      WECHAT_PAY_MCH_SERIAL_NO: "serial",
      WECHAT_PAY_PRIVATE_KEY: "mock-key-never-signed",
      WECHAT_PAY_NOTIFY_URL: "https://example.test/hooks",
      WECHAT_PAY_PUBLIC_KEY_ID: "public-id",
      WECHAT_PAY_PUBLIC_KEY: "mock-key-never-used",
    })
  it("supports a stable simulated full refund without network calls", async () => {
    const provider = new WeChatPayProviderService({ logger } as never, {
      WECHAT_PAY_MODE: "mock",
    })
    expect((await provider.refundPayment(input)).data).toMatchObject({
      out_refund_no: expected.reference,
      refund_status: "SUCCESS",
    })
    await expect(
      provider.refundPayment({ ...input, amount: 1 })
    ).rejects.toThrow("full original amount")
  })
  it("refuses managed live refunds while the switch is closed", async () => {
    process.env.CUSTOM_ORDER_LIVE_REFUNDS_ENABLED = "false"
    await expect(live().refundPayment(input)).rejects.toThrow("disabled")
  })
  it.each(["PROCESSING", "SUCCESS"])(
    "mirrors only a SUCCESS receipt: %s",
    async (status) => {
      process.env.CUSTOM_ORDER_LIVE_REFUNDS_ENABLED = "true"
      const provider = live()
      const api = {
        queryRefund: jest.fn(async () => ({ ...receipt(), status })),
        refund: jest.fn(),
      }
      Object.assign(provider, { client_: api })
      if (status === "SUCCESS")
        expect((await provider.refundPayment(input)).data).toMatchObject({
          refund_status: "SUCCESS",
          refund_id: "refund-provider-1",
        })
      else
        await expect(provider.refundPayment(input)).rejects.toThrow(
          "still processing"
        )
      expect(api.refund).not.toHaveBeenCalled()
    }
  )
})
