import {
  customPaymentConfig,
  protectCustomPaymentCollection,
  requireEmptyPaymentBody,
} from "../custom-order-payments"

describe("custom payment API protection", () => {
  it.each([
    { amount: 1 },
    { provider_id: "pp_system_default" },
    { payment_status: "captured" },
    [],
    "bad",
  ])("rejects client payment instructions %j", (value) => {
    expect(() => requireEmptyPaymentBody(value)).toThrow("empty")
  })
  it("prevents the standard store endpoint from replacing custom-order sessions", async () => {
    const next = jest.fn()
    const req = {
      params: { id: "pay_col_123" },
      scope: {
        resolve: () => ({
          retrievePaymentCollection: async () => ({
            metadata: { custom_order_id: "cor-1" },
          }),
        }),
      },
    }
    await expect(
      protectCustomPaymentCollection(req as never, {} as never, next)
    ).rejects.toMatchObject({ type: "forbidden" })
    expect(next).not.toHaveBeenCalled()
  })
  it("leaves normal cart sessions working", async () => {
    const next = jest.fn()
    const req = {
      params: { id: "pay_col_123" },
      scope: {
        resolve: () => ({
          retrievePaymentCollection: async () => ({ metadata: null }),
        }),
      },
    }
    await protectCustomPaymentCollection(req as never, {} as never, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
  it("refuses live custom payments without explicit enablement", () => {
    const previous = { ...process.env }
    try {
      process.env.WECHAT_PAY_ENABLED = "true"
      process.env.WECHAT_PAY_MODE = "live"
      process.env.CUSTOM_ORDER_LIVE_PAYMENTS_ENABLED = "false"
      // It may fail earlier on absent credentials, but it must never return a live config.
      expect(() => customPaymentConfig()).toThrow()
    } finally {
      process.env = previous
    }
  })
})
