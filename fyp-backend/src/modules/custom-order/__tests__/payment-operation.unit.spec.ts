import { CustomOrderService } from "../service"
import { assertPaymentPreparation } from "../payment"
import {
  assertUnpaidCollection,
  fullRefundReference,
  parsePaymentOperationBody,
  paymentOperation,
  PAYMENT_OPERATION_KEY,
} from "../payment-operation"
const order = {
  id: "cor-1",
  customer_id: "customer-1",
  status: "confirmed",
  payment_status: "pending",
  quoted_amount: 680,
  currency_code: "cny",
  version: 3,
  metadata: { __custom_order_payment_collection_id: "pay_col_1" },
}
function fixture() {
  let current: any = structuredClone(order)
  const update = jest.fn(async (data) => (current = { ...current, ...data }))
  const history = jest.fn()
  const service = Object.assign(Object.create(CustomOrderService.prototype), {
    retrieveCustomOrderRequest: jest.fn(async () => current),
    updateCustomOrderRequests: update,
    createCustomOrderStatusHistories: history,
  }) as CustomOrderService
  return { service, update, history, current: () => current }
}
const input = {
  id: order.id,
  kind: "retry" as const,
  version: 3,
  reason: "fresh session",
  actor: { actor_type: "customer" as const, actor_id: "customer-1" },
}
const context = { transactionManager: {} } as never
describe("durable payment operation foundation (no provider calls)", () => {
  it("reserves one intent idempotently and refuses stale or conflicting operations", async () => {
    const h = fixture()
    const first = await h.service.beginPaymentOperation(input, context)
    const second = await h.service.beginPaymentOperation(input, context)
    expect(paymentOperation(first)?.id).toBe(paymentOperation(second)?.id)
    expect(h.update).toHaveBeenCalledTimes(1)
    await expect(
      h.service.beginPaymentOperation(
        { ...input, kind: "cancel", version: 4 },
        context
      )
    ).rejects.toThrow("resumed first")
    await expect(
      fixture().service.beginPaymentOperation({ ...input, version: 2 }, context)
    ).rejects.toThrow("order changed")
  })
  it("checks ownership even for repeated intent requests and forbids customer refunds", async () => {
    const h = fixture()
    await h.service.beginPaymentOperation(input, context)
    await expect(
      h.service.beginPaymentOperation(
        { ...input, actor: { actor_type: "customer", actor_id: "stranger" } },
        context
      )
    ).rejects.toThrow("actor")
    await expect(
      fixture().service.beginPaymentOperation(
        { ...input, kind: "refund" },
        context
      )
    ).rejects.toThrow("actor")
  })
  it("keeps durable intent if work fails and blocks new payments/production", async () => {
    const h = fixture()
    const reserved = await h.service.beginPaymentOperation(input, context)
    await expect(
      h.service.executePaymentOperation(
        order.id,
        paymentOperation(reserved)!.id,
        async () => {
          throw Error("ambiguous result")
        },
        context
      )
    ).rejects.toThrow("ambiguous")
    expect(paymentOperation(h.current())?.status).toBe("requested")
    expect(() => assertPaymentPreparation(h.current(), "customer-1")).toThrow(
      "pending"
    )
    await expect(
      h.service.updateCustomOrderAtomically(
        { id: order.id, status: "produced" },
        context
      )
    ).rejects.toThrow("pending payment operation")
  })
  it("resumes a successful internal retry once without cancelling the order", async () => {
    const h = fixture()
    const reserved = await h.service.beginPaymentOperation(input, context)
    const work = jest.fn(async () => ({ status: "completed" as const }))
    await h.service.executePaymentOperation(
      order.id,
      paymentOperation(reserved)!.id,
      work,
      context
    )
    await h.service.executePaymentOperation(
      order.id,
      paymentOperation(reserved)!.id,
      work,
      context
    )
    expect(work).toHaveBeenCalledTimes(1)
    expect(h.current().status).toBe("confirmed")
    expect(h.history).not.toHaveBeenCalled()
  })
  it.each([
    { version: 1, amount: 1 },
    { version: -1 },
    { version: 1, reason: "" },
    { version: 1, reason: 9 },
  ])("rejects injected or invalid operation inputs %j", (body) => {
    expect(() => parsePaymentOperationBody(body, "cancel")).toThrow()
  })
  it("rejects unpaid cancellation when there is any ledger payment activity", () => {
    const collection = {
      id: "pay_col_1",
      amount: 6.8,
      currency_code: "cny",
      metadata: { custom_order_id: order.id },
      payments: [{ id: "payment" }],
    }
    expect(() => assertUnpaidCollection(order, collection as never)).toThrow(
      "activity"
    )
  })
  it("keeps a stable full-refund identity and detects corrupted operation metadata", () => {
    expect(fullRefundReference(order)).toBe(
      fullRefundReference({ ...order, version: 9 })
    )
    expect(() =>
      paymentOperation({
        metadata: { [PAYMENT_OPERATION_KEY]: { status: "success" } },
      })
    ).toThrow("Invalid")
  })
})
