import jwt from "jsonwebtoken"
import {
  artisanTalkJsId,
  customerTalkJsId,
  prepareTalkJsSession,
} from "../talkjs"

const originalAppId = process.env.TALKJS_APP_ID
const originalSecret = process.env.TALKJS_SECRET_KEY

const input = {
  orderId: "cor_test_1",
  orderTitle: "Engraved cup",
  currentUserId: customerTalkJsId("cus_1"),
  customer: {
    id: customerTalkJsId("cus_1"),
    name: "Test Buyer",
    custom: { platform_role: "buyer" },
  },
  artisan: {
    id: artisanTalkJsId("art_1"),
    name: "Test Artisan",
    custom: { platform_role: "artisan" },
  },
  messages: [
    {
      sender_type: "customer" as const,
      message: "Please engrave CXC.",
      created_at: "2026-09-19T00:00:00.000Z",
    },
  ],
}

describe("TalkJS custom-order session", () => {
  beforeEach(() => {
    process.env.TALKJS_APP_ID = "test_app"
    process.env.TALKJS_SECRET_KEY = "test_secret"
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env.TALKJS_APP_ID = originalAppId
    process.env.TALKJS_SECRET_KEY = originalSecret
  })

  it("creates a private order conversation and imports local history once", async () => {
    const request = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, options) =>
        new Response(null, { status: options?.method === "GET" ? 404 : 200 })
      )

    const session = await prepareTalkJsSession(input)
    const calls = request.mock.calls.map(([url, options]) => ({
      url: String(url),
      method: options?.method || "GET",
      body: options?.body ? JSON.parse(String(options.body)) : undefined,
    }))

    expect(session.app_id).toBe("test_app")
    expect(session.user_id).toBe("customer_cus_1")
    expect(session.conversation_id).toMatch(/^custom_order_[a-f0-9]{32}$/)
    expect(jwt.verify(session.token, "test_secret")).toEqual(
      expect.objectContaining({
        tokenType: "user",
        iss: "test_app",
        sub: "customer_cus_1",
      })
    )
    expect(calls.filter((call) => call.url.includes("/users/"))).toHaveLength(2)
    expect(
      calls.find((call) => call.url.includes("/import/conversations/"))?.body
    ).toEqual([
      expect.objectContaining({
        text: "Please engrave CXC.",
        sender: "customer_cus_1",
        type: "UserMessage",
      }),
    ])
  })

  it("does not import local messages into an existing conversation", async () => {
    const request = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }))

    await prepareTalkJsSession(input)

    expect(
      request.mock.calls.some(([url]) =>
        String(url).includes("/import/conversations/")
      )
    ).toBe(false)
  })
})
