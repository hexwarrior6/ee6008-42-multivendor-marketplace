import { createCipheriv, createSign, generateKeyPairSync } from "crypto";
import { WeChatPayClient } from "../client";

describe("WeChat Pay API v3 notification security", () => {
  it("verifies the signature and decrypts an AES-256-GCM transaction", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const apiV3Key = "12345678901234567890123456789012";
    const nonce = "0123456789ab";
    const associatedData = "transaction";
    const transaction = {
      out_trade_no: "HM_TEST",
      trade_state: "SUCCESS",
      attach: "payses_test",
      amount: { total: 1250, payer_total: 1250, currency: "CNY" },
    };
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(apiV3Key),
      Buffer.from(nonce)
    );
    cipher.setAAD(Buffer.from(associatedData));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(transaction)),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");
    const rawBody = JSON.stringify({
      id: "event_test",
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      resource: {
        algorithm: "AEAD_AES_256_GCM",
        ciphertext: encrypted,
        associated_data: associatedData,
        nonce,
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headerNonce = "notification-nonce";
    const signature = createSign("RSA-SHA256")
      .update(`${timestamp}\n${headerNonce}\n${rawBody}\n`)
      .end()
      .sign(privateKey, "base64");
    const client = new WeChatPayClient({
      mode: "live",
      appId: "wx-app",
      merchantId: "merchant",
      apiV3Key,
      merchantSerialNumber: "merchant-serial",
      privateKey,
      notifyUrl: "https://example.test/hooks",
      publicKeyId: "PUB_KEY_ID_TEST",
      publicKey,
      apiBaseUrl: "https://api.mch.weixin.qq.com",
    });

    const result = client.verifyAndDecryptNotification(rawBody, {
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": headerNonce,
      "wechatpay-signature": signature,
      "wechatpay-serial": "PUB_KEY_ID_TEST",
    });

    expect(result.transaction).toEqual(transaction);
  });
});
