import { GET, POST } from "../route"
import { PAYMENT_BINDING_KEY } from "../../../../../../modules/custom-order/payment"

function setup(body: unknown = {}, linked = false) {
  const order = {
    id: "cor-1",
    artisan_id: "art-1",
    customer_id: "customer-1",
    status: "confirmed",
    payment_status: "pending",
    quoted_amount: 680,
    currency_code: "cny",
    version: 4,
    metadata: linked ? { [PAYMENT_BINDING_KEY]: "pay_col_existing" } : {},
  }
  const retrieve = jest.fn().mockResolvedValue(order)
  const bind = jest
    .fn()
    .mockImplementation(async (input) => ({
      ...order,
      metadata: { [PAYMENT_BINDING_KEY]: input.collection_id },
    }))
  const payment = {
    createPaymentCollections: jest
      .fn()
      .mockResolvedValue({ id: "pay_col_new" }),
    retrievePaymentCollection: jest.fn().mockImplementation(async (id) => ({
      id,
      currency_code: "cny",
      amount: 6.8,
      status: "not_paid",
      metadata: { custom_order_id: "cor-1", secret: "never-return" },
      payment_sessions: [],
      payments: [],
    })),
    deletePaymentCollections: jest.fn().mockResolvedValue(undefined),
  }
  const logger = { warn: jest.fn() }
  const req = {
    params: { id: order.id },
    body,
    auth_context: { actor_type: "customer", actor_id: "customer-1" },
    scope: {
      resolve: (key: string) =>
        key === "custom_order"
          ? {
              retrieveCustomOrderRequest: retrieve,
              bindPaymentCollection: bind,
            }
          : key === "payment"
          ? payment
          : logger,
    },
  }
  const res = { json: jest.fn() }
  return {
    req: req as never,
    res: res as never,
    response: res.json,
    payment,
    bind,
    retrieve,
    order,
    logger,
  }
}
describe("custom order payment collection API", () => {
  it("prepares from the server quote, not client money, and returns no provider data", async () => {
    const { req, res, payment, response } = setup()
    await POST(req, res)
    expect(payment.createPaymentCollections).toHaveBeenCalledWith({
      amount: 6.8,
      currency_code: "cny",
      metadata: { custom_order_id: "cor-1" },
    })
    expect(response).toHaveBeenCalledWith({
      payment_collection: {
        id: "pay_col_new",
        currency_code: "cny",
        amount: 6.8,
        status: "not_paid",
        authorized_amount: 0,
        captured_amount: 0,
        refunded_amount: 0,
        verification: "unverified",
      },
      payment_status: "pending",
    })
  })
  it.each([
    { amount: 0.01 },
    { payment_collection_id: "pay_col_foreign" },
    { payment_status: "captured" },
    [],
    "bad",
  ])("rejects client injection %j", async (body) => {
    const { req, res, payment } = setup(body)
    await expect(POST(req, res)).rejects.toMatchObject({ type: "invalid_data" })
    expect(payment.createPaymentCollections).not.toHaveBeenCalled()
  })
  it("reuses an existing binding", async () => {
    const { req, res, payment, bind } = setup({}, true)
    await POST(req, res)
    expect(payment.createPaymentCollections).not.toHaveBeenCalled()
    expect(bind).not.toHaveBeenCalled()
  })
  it("returns null without creating anything on a read-only query", async () => {
    const { req, res, payment, response } = setup()
    await GET(req, res)
    expect(response).toHaveBeenCalledWith({
      payment_collection: null,
      payment_status: "pending",
    })
    expect(payment.createPaymentCollections).not.toHaveBeenCalled()
  })
  it.each([
    { currency_code: "usd" },
    { amount: 0.01 },
    { metadata: { custom_order_id: "cor-other" } },
  ])("refuses inconsistent ledger data %j", async (mismatch) => {
    const { req, res, payment } = setup({}, true)
    payment.retrievePaymentCollection.mockResolvedValue({
      id: "pay_col_existing",
      amount: 6.8,
      currency_code: "cny",
      status: "not_paid",
      metadata: { custom_order_id: "cor-1" },
      ...mismatch,
    } as never)
    await expect(GET(req, res)).rejects.toMatchObject({ type: "conflict" })
  })
  it("cleans up only the losing newly created collection", async () => {
    const { req, res, payment, bind, order, response } = setup()
    bind.mockResolvedValue({
      ...order,
      metadata: { [PAYMENT_BINDING_KEY]: "pay_col_winner" },
    })
    await POST(req, res)
    expect(payment.deletePaymentCollections).toHaveBeenCalledWith("pay_col_new")
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_collection: expect.objectContaining({ id: "pay_col_winner" }),
      })
    )
  })
  it("does not delete a collection after an ambiguous successful commit", async () => {
    const { req, res, payment, bind, retrieve, order } = setup()
    bind.mockRejectedValue(new Error("lost commit response"))
    retrieve
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({
        ...order,
        metadata: { [PAYMENT_BINDING_KEY]: "pay_col_new" },
      })
    await expect(POST(req, res)).rejects.toThrow("lost commit response")
    expect(payment.deletePaymentCollections).not.toHaveBeenCalled()
  })
  it("does not cascade-delete a losing collection if payment activity has appeared", async () => {
    const { req, res, payment, bind, order, logger } = setup()
    bind.mockResolvedValue({
      ...order,
      metadata: { [PAYMENT_BINDING_KEY]: "pay_col_winner" },
    })
    payment.retrievePaymentCollection.mockImplementation(
      async (id) =>
        ({
          id,
          currency_code: "cny",
          amount: 6.8,
          status: "not_paid",
          metadata: { custom_order_id: "cor-1" },
          payment_sessions: [{ id: "payses-1" }],
          payments: [],
        } as never)
    )
    await POST(req, res)
    expect(payment.deletePaymentCollections).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })
  it("removes a definitely unbound empty collection after a version conflict", async () => {
    const { req, res, payment, bind } = setup()
    bind.mockRejectedValue(new Error("version changed"))
    await expect(POST(req, res)).rejects.toThrow("version changed")
    expect(payment.deletePaymentCollections).toHaveBeenCalledWith("pay_col_new")
  })
  it("leaves ambiguous collections for reconciliation when durable state cannot be read", async () => {
    const { req, res, payment, bind, retrieve, order, logger } = setup()
    bind.mockRejectedValue(new Error("lost commit response"))
    retrieve
      .mockResolvedValueOnce(order)
      .mockRejectedValueOnce(new Error("database unavailable"))
    await expect(POST(req, res)).rejects.toThrow("lost commit response")
    expect(payment.deletePaymentCollections).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })
})
