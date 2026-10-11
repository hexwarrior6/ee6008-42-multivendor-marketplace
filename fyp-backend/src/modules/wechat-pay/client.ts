import {
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes,
} from "crypto";
import { MedusaError } from "@medusajs/framework/utils";
import type { WeChatPayConfig } from "./config";

export type WeChatNativeOrder = { code_url: string };

export type WeChatOrder = {
  appid?: string;
  mchid?: string;
  out_trade_no: string;
  transaction_id?: string;
  trade_state: string;
  trade_state_desc?: string;
  attach?: string;
  amount?: { total?: number; payer_total?: number; currency?: string };
};

export type WeChatNotification = {
  id: string;
  event_type: string;
  resource_type: string;
  resource: {
    algorithm: string;
    ciphertext: string;
    associated_data?: string;
    nonce: string;
  };
};

type RequestOptions = {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
};

const headerValue = (headers: Record<string, unknown>, name: string) => {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  const value = entry?.[1];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
};

export class WeChatPayClient {
  constructor(private readonly config: WeChatPayConfig) {}

  private ensureLiveConfig() {
    if (this.config.mode !== "live") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A live WeChat Pay operation was requested while mock mode is enabled"
      );
    }
  }

  private sign(message: string) {
    this.ensureLiveConfig();
    return createSign("RSA-SHA256")
      .update(message)
      .end()
      .sign(this.config.privateKey!, "base64");
  }

  private verify(message: string, signature: string) {
    this.ensureLiveConfig();
    return createVerify("RSA-SHA256")
      .update(message)
      .end()
      .verify(this.config.publicKey!, signature, "base64");
  }

  private async request<T>({ method, path, body }: RequestOptions): Promise<T> {
    this.ensureLiveConfig();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const bodyText = body ? JSON.stringify(body) : "";
    const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyText}\n`;
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.merchantId}",` +
      `nonce_str="${nonce}",timestamp="${timestamp}",` +
      `serial_no="${this.config.merchantSerialNumber}",` +
      `signature="${this.sign(canonical)}"`;

    const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        "Content-Type": "application/json",
        "User-Agent": "handmade-marketplace/1.0",
      },
      body: bodyText || undefined,
    });
    const responseText = await response.text();

    const responseTimestamp = response.headers.get("wechatpay-timestamp");
    const responseNonce = response.headers.get("wechatpay-nonce");
    const responseSignature = response.headers.get("wechatpay-signature");
    const responseSerial = response.headers.get("wechatpay-serial");

    if (
      responseSerial &&
      this.config.publicKeyId &&
      responseSerial !== this.config.publicKeyId
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay response used an unexpected public-key serial"
      );
    }
    if (!responseTimestamp || !responseNonce || !responseSignature) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay response signature headers are missing"
      );
    }
    const responseMessage = `${responseTimestamp}\n${responseNonce}\n${responseText}\n`;
    if (!this.verify(responseMessage, responseSignature)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay response signature is invalid"
      );
    }

    const parsed = responseText ? JSON.parse(responseText) : {};
    if (!response.ok) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `WeChat Pay request failed (${response.status}): ${
          parsed.message || parsed.code || "unknown error"
        }`
      );
    }
    return parsed as T;
  }

  createNativeOrder(body: Record<string, unknown>) {
    return this.request<WeChatNativeOrder>({
      method: "POST",
      path: "/v3/pay/transactions/native",
      body,
    });
  }

  queryOrder(outTradeNo: string) {
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(
      outTradeNo
    )}?mchid=${encodeURIComponent(this.config.merchantId!)}`;
    return this.request<WeChatOrder>({ method: "GET", path });
  }

  closeOrder(outTradeNo: string) {
    return this.request<Record<string, never>>({
      method: "POST",
      path: `/v3/pay/transactions/out-trade-no/${encodeURIComponent(
        outTradeNo
      )}/close`,
      body: { mchid: this.config.merchantId },
    });
  }

  refund(body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>({
      method: "POST",
      path: "/v3/refund/domestic/refunds",
      body,
    });
  }

  verifyAndDecryptNotification(
    rawData: string | Buffer,
    headers: Record<string, unknown>
  ) {
    this.ensureLiveConfig();
    const rawBody = Buffer.isBuffer(rawData)
      ? rawData.toString("utf8")
      : rawData;
    const timestamp = headerValue(headers, "wechatpay-timestamp");
    const nonce = headerValue(headers, "wechatpay-nonce");
    const signature = headerValue(headers, "wechatpay-signature");
    const serial = headerValue(headers, "wechatpay-serial");

    if (!timestamp || !nonce || !signature || !serial) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay notification signature headers are missing"
      );
    }
    if (serial !== this.config.publicKeyId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay notification used an unexpected public-key serial"
      );
    }
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay notification timestamp is outside the five-minute window"
      );
    }
    if (!this.verify(`${timestamp}\n${nonce}\n${rawBody}\n`, signature)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "WeChat Pay notification signature is invalid"
      );
    }

    const notification = JSON.parse(rawBody) as WeChatNotification;
    if (notification.resource.algorithm !== "AEAD_AES_256_GCM") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Unsupported WeChat Pay notification encryption algorithm"
      );
    }
    const encrypted = Buffer.from(notification.resource.ciphertext, "base64");
    const authTag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(this.config.apiV3Key!, "utf8"),
      Buffer.from(notification.resource.nonce, "utf8")
    );
    decipher.setAuthTag(authTag);
    decipher.setAAD(
      Buffer.from(notification.resource.associated_data || "", "utf8")
    );
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    return {
      notification,
      transaction: JSON.parse(plaintext) as WeChatOrder,
    };
  }
}
