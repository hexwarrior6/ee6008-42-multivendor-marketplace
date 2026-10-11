import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
  Logger,
} from "@medusajs/framework/types";
import {
  AbstractPaymentProvider,
  BigNumber,
  MathBN,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import { createHash, randomUUID } from "crypto";
import { WeChatPayClient, type WeChatOrder } from "./client";
import { loadWeChatPayConfig, type WeChatPayConfig } from "./config";

type InjectedDependencies = { logger: Logger };

const asData = (data?: Record<string, unknown>) => ({ ...(data || {}) });
const amountToFen = (amount: InitiatePaymentInput["amount"]) =>
  Math.round(new BigNumber(MathBN.mult(amount, 100)).numeric);
const amountFromFen = (amount = 0) => new BigNumber(MathBN.div(amount, 100));
const makeExternalId = (seed: string) =>
  `HM${createHash("sha256").update(seed).digest("hex").slice(0, 30)}`;

const mapTradeState = (state?: string): PaymentSessionStatus => {
  switch (state) {
    case "SUCCESS":
      return PaymentSessionStatus.CAPTURED;
    case "CLOSED":
    case "REVOKED":
      return PaymentSessionStatus.CANCELED;
    case "PAYERROR":
      return PaymentSessionStatus.ERROR;
    default:
      return PaymentSessionStatus.PENDING;
  }
};

export default class WeChatPayProviderService extends AbstractPaymentProvider<WeChatPayConfig> {
  static identifier = "wechat";
  protected readonly logger_: Logger;
  protected readonly options_: WeChatPayConfig;
  protected readonly client_: WeChatPayClient;

  static validateOptions(options: Record<string, unknown>) {
    loadWeChatPayConfig(options as NodeJS.ProcessEnv);
  }

  constructor(
    container: InjectedDependencies,
    options: Record<string, unknown>
  ) {
    const config = loadWeChatPayConfig(options as NodeJS.ProcessEnv);
    super(container, config);
    this.logger_ = container.logger;
    this.options_ = config;
    this.client_ = new WeChatPayClient(config);
  }

  private assertCny(currencyCode: string) {
    if (currencyCode.toLowerCase() !== "cny") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay payments must use CNY"
      );
    }
  }

  private async currentOrder(data?: Record<string, unknown>) {
    if (this.options_.mode === "mock") {
      return {
        out_trade_no: String(data?.out_trade_no || data?.session_id || "mock"),
        trade_state: String(data?.trade_state || "NOTPAY"),
        attach: String(data?.session_id || ""),
        amount: { total: Number(data?.amount_fen || 0), currency: "CNY" },
      } satisfies WeChatOrder;
    }
    const outTradeNo = String(data?.out_trade_no || "");
    if (!outTradeNo) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay payment data is missing out_trade_no"
      );
    }
    return this.client_.queryOrder(outTradeNo);
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    this.assertCny(input.currency_code);
    const data = asData(input.data);
    const sessionId = String(
      data.session_id || input.context?.idempotency_key || randomUUID()
    );
    const amountFen = amountToFen(input.amount);
    const outTradeNo = makeExternalId(`${sessionId}:${amountFen}`);

    if (this.options_.mode === "mock") {
      return {
        id: outTradeNo,
        status: PaymentSessionStatus.PENDING,
        data: {
          ...data,
          session_id: sessionId,
          out_trade_no: outTradeNo,
          amount_fen: amountFen,
          currency: "CNY",
          code_url: `weixin://wxpay/bizpayurl/up?pr=MOCK_${outTradeNo}`,
          trade_state: "NOTPAY",
          mock: true,
        },
      };
    }

    const response = await this.client_.createNativeOrder({
      appid: this.options_.appId,
      mchid: this.options_.merchantId,
      description: String(
        data.description || "Handmade Marketplace Order"
      ).slice(0, 127),
      out_trade_no: outTradeNo,
      notify_url: this.options_.notifyUrl,
      attach: sessionId,
      amount: { total: amountFen, currency: "CNY" },
    });

    return {
      id: outTradeNo,
      status: PaymentSessionStatus.PENDING,
      data: {
        ...data,
        session_id: sessionId,
        out_trade_no: outTradeNo,
        amount_fen: amountFen,
        currency: "CNY",
        code_url: response.code_url,
        trade_state: "NOTPAY",
        mock: false,
      },
    };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const data = asData(input.data);
    const amountFen = amountToFen(input.amount);
    if (Number(data.amount_fen) === amountFen) {
      return { status: mapTradeState(String(data.trade_state)), data };
    }
    await this.cancelPayment({ data });
    return this.initiatePayment(input);
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(input);
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = asData(input.data);
    if (this.options_.mode === "mock") {
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: { ...data, trade_state: "SUCCESS", mock_authorized: true },
      };
    }
    const order = await this.currentOrder(data);
    return {
      status: mapTradeState(order.trade_state),
      data: { ...data, ...order },
    };
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    // Native WeChat payments are captured by WeChat when the customer pays.
    return { data: { ...asData(input.data), captured: true } };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = asData(input.data);
    const refundFen = amountToFen(input.amount);
    const totalFen = Number(data.amount_fen);
    if (!Number.isFinite(totalFen) || totalFen <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay payment data is missing a valid original amount"
      );
    }
    const outRefundNo = makeExternalId(
      `refund:${String(data.out_trade_no)}:${refundFen}`
    );
    if (this.options_.mode !== "mock") {
      await this.client_.refund({
        out_trade_no: data.out_trade_no,
        out_refund_no: outRefundNo,
        notify_url: this.options_.notifyUrl,
        amount: { refund: refundFen, total: totalFen, currency: "CNY" },
      });
    }
    return {
      data: {
        ...data,
        out_refund_no: outRefundNo,
        refund_amount_fen: refundFen,
        refund_status: this.options_.mode === "mock" ? "SUCCESS" : "PROCESSING",
      },
    };
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const data = asData(input.data);
    const order = await this.currentOrder(data);
    return { data: { ...data, ...order } };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const data = asData(input.data);
    const outTradeNo = String(data.out_trade_no || "");
    if (this.options_.mode !== "mock" && outTradeNo) {
      const order = await this.client_.queryOrder(outTradeNo);
      if (["NOTPAY", "USERPAYING"].includes(order.trade_state)) {
        await this.client_.closeOrder(outTradeNo);
      }
    }
    return { data: { ...data, trade_state: "CLOSED" } };
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = asData(input.data);
    const order = await this.currentOrder(data);
    return {
      status: mapTradeState(order.trade_state),
      data: { ...data, ...order },
    };
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    if (this.options_.mode === "mock") {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    try {
      const { transaction } = this.client_.verifyAndDecryptNotification(
        payload.rawData,
        payload.headers
      );
      const sessionId = transaction.attach || "";
      const amount = amountFromFen(
        transaction.amount?.payer_total ?? transaction.amount?.total ?? 0
      );
      const action =
        transaction.trade_state === "SUCCESS"
          ? PaymentActions.SUCCESSFUL
          : ["CLOSED", "REVOKED"].includes(transaction.trade_state)
          ? PaymentActions.CANCELED
          : transaction.trade_state === "PAYERROR"
          ? PaymentActions.FAILED
          : PaymentActions.PENDING;
      return { action, data: { session_id: sessionId, amount } };
    } catch (error) {
      this.logger_.error(
        `Rejected WeChat Pay notification: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { action: PaymentActions.FAILED };
    }
  }
}
