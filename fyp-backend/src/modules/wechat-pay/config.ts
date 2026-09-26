import { MedusaError } from "@medusajs/framework/utils";

export type WeChatPayMode = "mock" | "live";

export type WeChatPayConfig = {
  mode: WeChatPayMode;
  appId?: string;
  merchantId?: string;
  apiV3Key?: string;
  merchantSerialNumber?: string;
  privateKey?: string;
  notifyUrl?: string;
  publicKeyId?: string;
  publicKey?: string;
  apiBaseUrl: string;
};

const normalisePem = (value?: string) => value?.replace(/\\n/g, "\n").trim();

export function loadWeChatPayConfig(
  env: NodeJS.ProcessEnv = process.env
): WeChatPayConfig {
  // Keep the old flag working for existing local .env files.
  const mode: WeChatPayMode =
    env.WECHAT_PAY_MODE === "live" || env.WECHAT_PAY_SANDBOX === "false"
      ? "live"
      : "mock";

  const config: WeChatPayConfig = {
    mode,
    appId: env.WECHAT_PAY_APP_ID?.trim(),
    merchantId: env.WECHAT_PAY_MCH_ID?.trim(),
    apiV3Key: env.WECHAT_PAY_API_V3_KEY?.trim(),
    merchantSerialNumber: env.WECHAT_PAY_MCH_SERIAL_NO?.trim(),
    privateKey: normalisePem(env.WECHAT_PAY_PRIVATE_KEY),
    notifyUrl: env.WECHAT_PAY_NOTIFY_URL?.trim(),
    publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID?.trim(),
    publicKey: normalisePem(env.WECHAT_PAY_PUBLIC_KEY),
    apiBaseUrl:
      env.WECHAT_PAY_API_BASE_URL?.replace(/\/$/, "") ||
      "https://api.mch.weixin.qq.com",
  };

  if (mode === "mock") {
    return config;
  }

  const required: Array<[keyof WeChatPayConfig, string]> = [
    ["appId", "WECHAT_PAY_APP_ID"],
    ["merchantId", "WECHAT_PAY_MCH_ID"],
    ["apiV3Key", "WECHAT_PAY_API_V3_KEY"],
    ["merchantSerialNumber", "WECHAT_PAY_MCH_SERIAL_NO"],
    ["privateKey", "WECHAT_PAY_PRIVATE_KEY"],
    ["notifyUrl", "WECHAT_PAY_NOTIFY_URL"],
    ["publicKeyId", "WECHAT_PAY_PUBLIC_KEY_ID"],
    ["publicKey", "WECHAT_PAY_PUBLIC_KEY"],
  ];
  const missing = required
    .filter(([key]) => !config[key])
    .map(([, envName]) => envName);

  if (missing.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Missing WeChat Pay live configuration: ${missing.join(", ")}`
    );
  }

  if (Buffer.byteLength(config.apiV3Key!, "utf8") !== 32) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "WECHAT_PAY_API_V3_KEY must contain exactly 32 bytes"
    );
  }

  if (!config.notifyUrl!.startsWith("https://")) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "WECHAT_PAY_NOTIFY_URL must use HTTPS in live mode"
    );
  }

  return config;
}

// Backwards-compatible export for code written before live/mock were separated.
export const loadWeChatPaySandboxConfig = loadWeChatPayConfig;
export type WeChatPaySandboxConfig = WeChatPayConfig;
