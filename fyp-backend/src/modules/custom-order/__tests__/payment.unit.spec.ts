import { CustomOrderService } from "../service"
import { LockMode } from "@medusajs/framework/mikro-orm/core"
import {
  assertPaymentPreparation,
  customOrderPaymentAmount,
  PAYMENT_BINDING_KEY,
  paymentCollectionId,
} from "../payment"

const order = {
  id: "cor-1",
  artisan_id: "art-1",
  customer_id: "customer-1",
  status: "confirmed",
  payment_status: "pending",
  version: 4,
  quoted_amount: 680,
  currency_code: "cny",
  metadata: { note: "keep" },
}
const linked = {
  ...order,
  metadata: { ...order.metadata, [PAYMENT_BINDING_KEY]: "pay_col_123" },
}
const setup = (current = order) => {
  const retrieve = jest.fn().mockResolvedValue(current)
  const update = jest
    .fn()
    .mockImplementation(async (data) => ({ ...current, ...data }))
  const service = Object.assign(Object.create(CustomOrderService.prototype), {
    retrieveCustomOrderRequest: retrieve,
    updateCustomOrderRequests: update,
  }) as CustomOrderService
  return {
    service,
    retrieve,
    update,
    context: { transactionManager: {} } as never,
  }
}
describe("custom payment preparation and binding", () => {
  it.each([
    [680, "cny", 6.8],
    [1234, "usd", 12.34],
    [680, "jpy", 680],
    [1234, "kwd", 1.234],
  ])(
    "converts %s minor %s to %s Medusa major units",
    (amount, currency, expected) => {
      expect(customOrderPaymentAmount(amount, currency)).toBe(expected)
    }
  )
  it.each([
    [0, "cny"],
    [-1, "cny"],
    [1.5, "cny"],
    [2147483648, "cny"],
    [680, "xyz"],
    [680, "CNY"],
    [null, "cny"],
  ])("rejects unsafe quote %s / %s", (amount, currency) => {
    expect(() =>
      customOrderPaymentAmount(amount as number, currency as string)
    ).toThrow()
  })
  it.each(["request", "quote", "produced", "delivered", "cancelled"])(
    "does not prepare payments in %s",
    (status) => {
      expect(() =>
        assertPaymentPreparation({ ...order, status }, "customer-1")
      ).toThrow("confirmed")
    }
  )
  it("rejects another buyer", () => {
    expect(() => assertPaymentPreparation(order, "stranger")).toThrow(
      "own custom orders"
    )
  })
  it("locks the order, preserves metadata and binds once without authorizing payment", async () => {
    const { service, retrieve, update, context } = setup()
    await service.bindPaymentCollection(
      {
        id: order.id,
        customer_id: order.customer_id,
        collection_id: "pay_col_123",
        version: 4,
      },
      context
    )
    expect(retrieve).toHaveBeenCalledWith(
      order.id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      context
    )
    expect(update).toHaveBeenCalledWith(
      {
        id: order.id,
        version: 5,
        metadata: { note: "keep", [PAYMENT_BINDING_KEY]: "pay_col_123" },
      },
      context
    )
  })
  it("returns the winning binding if a concurrent request already bound the order", async () => {
    const { service, update, context } = setup(linked)
    const result = await service.bindPaymentCollection(
      {
        id: order.id,
        customer_id: order.customer_id,
        collection_id: "pay_col_456",
        version: 4,
      },
      context
    )
    expect(paymentCollectionId(result)).toBe("pay_col_123")
    expect(update).not.toHaveBeenCalled()
  })
  it("rejects a changed version before writing a binding", async () => {
    const { service, update, context } = setup()
    await expect(
      service.bindPaymentCollection(
        {
          id: order.id,
          customer_id: order.customer_id,
          collection_id: "pay_col_123",
          version: 3,
        },
        context
      )
    ).rejects.toMatchObject({ type: "conflict" })
    expect(update).not.toHaveBeenCalled()
  })
  it.each([null, { note: "replace" }])(
    "preserves the binding when metadata is replaced with %j",
    async (metadata) => {
      const { service, update, context } = setup(linked)
      await service.updateCustomOrderAtomically(
        { id: order.id, metadata },
        context
      )
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            version: 5,
            metadata: { ...metadata, [PAYMENT_BINDING_KEY]: "pay_col_123" },
          },
        }),
        context
      )
    }
  )
  it("rejects forged binding metadata", async () => {
    const { service, update, context } = setup()
    await expect(
      service.updateCustomOrderAtomically(
        {
          id: order.id,
          metadata: { [PAYMENT_BINDING_KEY]: "pay_col_foreign" },
        },
        context
      )
    ).rejects.toMatchObject({ type: "not_allowed" })
    expect(update).not.toHaveBeenCalled()
  })
  it.each([
    { payment_status: "captured" as const },
    { status: "cancelled" as const, cancellation_reason: "test" },
  ])(
    "blocks manual payment/cancellation after binding: %j",
    async (mutation) => {
      const { service, update, context } = setup(linked)
      await expect(
        service.updateCustomOrderAtomically(
          { id: order.id, ...mutation },
          context
        )
      ).rejects.toMatchObject({ type: "not_allowed" })
      expect(update).not.toHaveBeenCalled()
    }
  )
  it("keeps an associated payment order from being deleted", async () => {
    const { service, context } = setup(linked)
    await expect(
      service.deleteCustomOrderWithRelations(order.id, context)
    ).rejects.toMatchObject({ type: "not_allowed" })
  })
})
