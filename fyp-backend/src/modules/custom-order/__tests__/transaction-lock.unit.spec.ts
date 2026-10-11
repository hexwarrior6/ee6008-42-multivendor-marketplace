import { LockMode } from "@medusajs/framework/mikro-orm/core"
import { CustomOrderService } from "../service"

function setup() {
  const current = {
    id: "cor-1",
    customer_id: "customer-1",
    status: "quote",
    version: 3,
    quoted_amount: 680,
    currency_code: "cny",
    payment_status: "pending",
  }
  const retrieve = jest.fn().mockResolvedValue(current)
  const update = jest
    .fn()
    .mockResolvedValue([{ ...current, status: "confirmed", version: 4 }])
  const history = jest.fn().mockResolvedValue({ id: "history-1" })
  const service = Object.assign(Object.create(CustomOrderService.prototype), {
    retrieveCustomOrderRequest: retrieve,
    updateCustomOrderRequests: update,
    createCustomOrderStatusHistories: history,
  }) as CustomOrderService
  const context = { transactionManager: {} } as never
  const input = {
    id: "cor-1",
    status: "confirmed" as const,
    actor: { actor_type: "customer" as const, actor_id: "customer-1" },
    customer_confirmation: {
      version: 3,
      quoted_amount: 680,
      currency_code: "cny",
    },
  }
  return { service, context, input, retrieve, update, history }
}

describe("custom-order mutation transaction locking", () => {
  it("locks and refreshes the row before checking the quote, sharing the transaction with the history write", async () => {
    const { service, context, input, retrieve, update, history } = setup()
    await service.updateCustomOrderAtomically(input, context)
    expect(retrieve).toHaveBeenCalledWith(
      "cor-1",
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      context
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: { id: "cor-1", version: 3 },
        data: { status: "confirmed", version: 4 },
      }),
      context
    )
    expect(history).toHaveBeenCalledWith(
      expect.objectContaining({
        from_status: "quote",
        to_status: "confirmed",
        actor_id: "customer-1",
      }),
      context
    )
    expect(retrieve.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder[0]
    )
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      history.mock.invocationCallOrder[0]
    )
  })
  it("does not write anything if the locked snapshot has a different quote version", async () => {
    const { service, context, input, update, history } = setup()
    await expect(
      service.updateCustomOrderAtomically(
        {
          ...input,
          customer_confirmation: { ...input.customer_confirmation, version: 2 },
        },
        context
      )
    ).rejects.toMatchObject({ type: "conflict" })
    expect(update).not.toHaveBeenCalled()
    expect(history).not.toHaveBeenCalled()
  })
})
