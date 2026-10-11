import { linkCustomOrder } from "../module-links"

describe("custom-order module links", () => {
  it("waits for both link writes before rejecting", async () => {
    let resolveFirst!: () => void
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const create = jest
      .fn()
      .mockImplementationOnce(() => first)
      .mockRejectedValueOnce(new Error("customer link failed"))
    const promise = linkCustomOrder(
      {
        resolve: () => ({ create }),
      },
      { orderId: "cor-1", customerId: "cus-1", artisanId: "art-1" }
    )

    let settled = false
    void promise.then(() => {
      settled = true
    }, () => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveFirst()
    await expect(promise).rejects.toThrow("customer link failed")
  })
})
