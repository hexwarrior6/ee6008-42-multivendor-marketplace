import { loadWeChatPayConfig } from "../config";

describe("WeChat Pay configuration", () => {
  it("starts in safe local mock mode without merchant secrets", () => {
    expect(loadWeChatPayConfig({ WECHAT_PAY_MODE: "mock" })).toMatchObject({
      mode: "mock",
      apiBaseUrl: "https://api.mch.weixin.qq.com",
    });
  });

  it("keeps the legacy sandbox flag compatible with mock mode", () => {
    expect(loadWeChatPayConfig({ WECHAT_PAY_SANDBOX: "true" }).mode).toBe(
      "mock"
    );
  });

  it("rejects live mode when merchant credentials are missing", () => {
    expect(() => loadWeChatPayConfig({ WECHAT_PAY_MODE: "live" })).toThrow(
      "Missing WeChat Pay live configuration"
    );
  });

  it("rejects a live API v3 key that is not 32 bytes", () => {
    expect(() =>
      loadWeChatPayConfig({
        WECHAT_PAY_MODE: "live",
        WECHAT_PAY_APP_ID: "wx-app",
        WECHAT_PAY_MCH_ID: "merchant",
        WECHAT_PAY_API_V3_KEY: "too-short",
        WECHAT_PAY_MCH_SERIAL_NO: "merchant-serial",
        WECHAT_PAY_PRIVATE_KEY: "private-key",
        WECHAT_PAY_NOTIFY_URL: "https://example.test/hooks",
        WECHAT_PAY_PUBLIC_KEY_ID: "wechat-key-id",
        WECHAT_PAY_PUBLIC_KEY: "public-key",
      })
    ).toThrow("exactly 32 bytes");
  });
});
