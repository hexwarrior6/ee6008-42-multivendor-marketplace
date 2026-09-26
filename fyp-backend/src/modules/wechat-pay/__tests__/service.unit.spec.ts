import { PaymentSessionStatus } from "@medusajs/framework/utils";
import WeChatPayProviderService from "../service";

const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe("WeChat Pay provider mock mode", () => {
  const provider = new WeChatPayProviderService({ logger } as any, {
    WECHAT_PAY_MODE: "mock",
  });

  it("creates a CNY native QR payment session without charging money", async () => {
    const result = await provider.initiatePayment({
      amount: 88.5,
      currency_code: "cny",
      data: { session_id: "payses_test" },
    });

    expect(result.status).toBe(PaymentSessionStatus.PENDING);
    expect(result.data).toMatchObject({
      session_id: "payses_test",
      amount_fen: 8850,
      currency: "CNY",
      mock: true,
      trade_state: "NOTPAY",
    });
    expect(result.data?.code_url).toMatch(/^weixin:\/\/wxpay\/bizpayurl/);
  });

  it("authorizes the local mock session so checkout can be tested end to end", async () => {
    const result = await provider.authorizePayment({
      data: { session_id: "payses_test", trade_state: "NOTPAY" },
    });
    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED);
    expect(result.data?.mock_authorized).toBe(true);
  });

  it("refuses non-CNY payments", async () => {
    await expect(
      provider.initiatePayment({ amount: 10, currency_code: "eur" })
    ).rejects.toThrow("must use CNY");
  });

  it("creates an idempotent mock refund reference", async () => {
    const input = {
      amount: 10,
      data: { out_trade_no: "HM_ORDER", amount_fen: 2000 },
    };
    const first = await provider.refundPayment(input);
    const second = await provider.refundPayment(input);
    expect(first.data?.out_refund_no).toBe(second.data?.out_refund_no);
    expect(first.data).toMatchObject({
      refund_amount_fen: 1000,
      refund_status: "SUCCESS",
    });
  });
});
