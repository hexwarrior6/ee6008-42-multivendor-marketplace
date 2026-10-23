import { GET, POST } from "../route"

function setup(options: { enabled?: boolean; customer?: string } = {}) {
  const order = {
    id: "cor-1",
    artisan_id: "artisan-1",
    customer_id: "customer-1",
    currency_code: "cny",
  }
  const list = jest.fn(async () => [
    { id: "pp_wechat_wechat", is_enabled: options.enabled !== false },
  ])
  const req = {
    params: { id: order.id },
    body: {},
    auth_context: {
      actor_type: "customer",
      actor_id: options.customer ?? "customer-1",
    },
    scope: {
      resolve: (key: string) =>
        key === "custom_order"
          ? { retrieveCustomOrderRequest: async () => order }
          : { listPaymentProviders: list },
    },
  }
  const response = jest.fn()
  return { req: req as never, res: { json: response } as never, response, list }
}
describe("custom WeChat payment availability", () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.WECHAT_PAY_ENABLED = "true"
    process.env.WECHAT_PAY_MODE = "mock"
    process.env.WECHAT_PAY_SANDBOX = "true"
  })
  afterAll(() => {
    process.env = env
  })
  it("reports local mock availability without creating collections or sessions", async () => {
    const { req, res, response, list } = setup()
    await GET(req, res)
    expect(list).toHaveBeenCalledWith({ id: "pp_wechat_wechat" })
    expect(response).toHaveBeenCalledWith({
      enabled: true,
      mode: "mock",
      currency_code: "cny",
    })
  })
  it("rejects an unregistered/disabled provider before binding", async () => {
    const { req, res } = setup({ enabled: false })
    await expect(GET(req, res)).rejects.toMatchObject({ type: "not_allowed" })
  })
  it("does not disclose another customer's payment availability", async () => {
    const { req, res, list } = setup({ customer: "stranger" })
    await expect(GET(req, res)).rejects.toMatchObject({ type: "forbidden" })
    expect(list).not.toHaveBeenCalled()
  })
  it("rejects injected provider instructions before any session creation", async () => {
    const { req, res } = setup()
    Object.assign(req, { body: { provider_id: "pp_system_default" } })
    await expect(POST(req, res)).rejects.toMatchObject({ type: "invalid_data" })
  })
})
