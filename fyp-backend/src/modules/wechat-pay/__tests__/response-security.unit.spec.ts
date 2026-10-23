import { createSign, generateKeyPairSync } from "node:crypto"
import { WeChatPayClient } from "../client"
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})
const config = {
  mode: "live" as const,
  merchantId: "merchant",
  merchantSerialNumber: "serial",
  privateKey,
  publicKey,
  publicKeyId: "PUB_KEY_ID_TEST",
  apiBaseUrl: "https://example.test",
}
const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
})
describe("WeChat response authenticity and bounded requests (mock network only)", () => {
  it.each([
    "valid",
    "missing-serial",
    "old-time",
    "invalid-time",
    "bad-signature",
  ])("handles %s response securely", async (kind) => {
    const body = JSON.stringify({
      out_trade_no: "order-1",
      trade_state: "NOTPAY",
    })
    const timestamp =
      kind === "old-time"
        ? "1"
        : kind === "invalid-time"
        ? "NaN"
        : String(Math.floor(Date.now() / 1000))
    const signature = createSign("RSA-SHA256")
      .update(`${timestamp}\nnonce\n${body}\n`)
      .end()
      .sign(privateKey, "base64")
    const headers: Record<string, string> = {
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": "nonce",
      "wechatpay-signature": kind === "bad-signature" ? "invalid" : signature,
      "wechatpay-serial": "PUB_KEY_ID_TEST",
    }
    if (kind === "missing-serial") delete headers["wechatpay-serial"]
    const fetchMock = jest.fn(
      async () => new Response(body, { status: 200, headers })
    )
    global.fetch = fetchMock as never
    const result = new WeChatPayClient(config).queryOrder("order-1")
    if (kind === "valid")
      await expect(result).resolves.toMatchObject({ out_trade_no: "order-1" })
    else await expect(result).rejects.toThrow()
    const options = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1]
    expect(options.method).toBe("GET")
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
})
