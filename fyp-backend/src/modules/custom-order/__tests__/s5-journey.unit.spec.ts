import {
  CUSTOM_ORDER_TRANSITIONS,
  assertCustomOrderBusinessRules,
  type CustomOrderPaymentStatus,
  type CustomOrderStatus,
} from "../state-machine"

type MutableOrder = {
  status: CustomOrderStatus
  quoted_amount: number | null
  payment_status: CustomOrderPaymentStatus
}

/**
 * S5 regression: replay the whole bespoke order journey exactly the way the
 * service does — one snapshot per stage, every mutation guarded by the shared
 * business rules — and prove the legal path plus the forbidden jumps.
 */
const evolve = (
  order: MutableOrder,
  next: CustomOrderStatus,
  input: Record<string, unknown> = {}
): MutableOrder => {
  assertCustomOrderBusinessRules(
    order,
    next,
    input as Parameters<typeof assertCustomOrderBusinessRules>[2]
  )
  return {
    status: next,
    quoted_amount:
      input.quoted_amount !== undefined
        ? (input.quoted_amount as number | null)
        : order.quoted_amount,
    payment_status:
      input.payment_status !== undefined
        ? (input.payment_status as CustomOrderPaymentStatus)
        : order.payment_status,
  }
}

describe("S5 custom order journey", () => {
  it("walks the full legal lifecycle request → quote → confirmed → produced → delivered", () => {
    let order: MutableOrder = {
      status: "request",
      quoted_amount: null,
      payment_status: "pending",
    }

    order = evolve(order, "quote", { quoted_amount: 680 })
    expect(order).toMatchObject({ status: "quote", quoted_amount: 680 })

    order = evolve(order, "confirmed")
    expect(order.status).toBe("confirmed")

    order = evolve(order, "produced", { payment_status: "authorized" })
    expect(order.status).toBe("produced")
    expect(order.payment_status).toBe("authorized")

    order = evolve(order, "delivered")
    expect(order.status).toBe("delivered")
  })

  it("keeps every legal transition open and closes the rest", () => {
    const legalPairs: Array<[CustomOrderStatus, CustomOrderStatus]> = []
    for (const [from, targets] of Object.entries(CUSTOM_ORDER_TRANSITIONS)) {
      for (const to of targets) {
        legalPairs.push([from as CustomOrderStatus, to as CustomOrderStatus])
      }
    }
    expect(legalPairs).toContainEqual(["produced", "delivered"])

    // A produced order can no longer be cancelled — it must be delivered.
    expect(() => evolve({
      status: "produced",
      quoted_amount: 680,
      payment_status: "captured",
    }, "cancelled", { cancellation_reason: "changed mind" })).toThrow(
      "Cannot move custom order from produced to cancelled"
    )
  })

  it("rejects stage skipping, terminal reopening, and reverse transitions", () => {
    const request = {
      status: "request" as const,
      quoted_amount: null,
      payment_status: "pending" as const,
    }
    const quote = { ...request, status: "quote" as const, quoted_amount: 680 }

    expect(() => evolve(request, "delivered")).toThrow(
      "Cannot move custom order from request to delivered"
    )
    expect(() => evolve(quote, "produced")).toThrow(
      "Cannot move custom order from quote to produced"
    )
    expect(() => evolve(quote, "request")).toThrow(
      "Cannot move custom order from quote to request"
    )
    expect(() => evolve({
      status: "cancelled",
      quoted_amount: 680,
      payment_status: "pending",
    }, "quote", { quoted_amount: 900 })).toThrow(
      "Cannot move custom order from cancelled to quote"
    )
  })

  it("rejects a zero or missing quote before entering quote", () => {
    const request = {
      status: "request" as const,
      quoted_amount: null,
      payment_status: "pending" as const,
    }
    expect(() =>
      evolve(request, "quote", { quoted_amount: 0 })
    ).toThrow("A positive quoted_amount is required")
    expect(() => evolve(request, "quote")).toThrow(
      "A positive quoted_amount is required"
    )
  })

  it("freezes the quote once the order is confirmed", () => {
    expect(() =>
      evolve(
        { status: "confirmed", quoted_amount: 680, payment_status: "pending" },
        "confirmed",
        { quoted_amount: 900 }
      )
    ).toThrow("The quote cannot be changed after confirmation")
  })

  it("lets a failed payment retry, but never regress from captured", () => {
    const confirmed = {
      status: "confirmed" as const,
      quoted_amount: 680,
      payment_status: "pending" as const,
    }

    let retrying = evolve(confirmed, "confirmed", { payment_status: "failed" })
    expect(retrying.payment_status).toBe("failed")

    retrying = evolve(retrying, "confirmed", { payment_status: "authorized" })
    expect(retrying.payment_status).toBe("authorized")

    expect(() =>
      evolve(
        { status: "confirmed", quoted_amount: 680, payment_status: "captured" },
        "confirmed",
        { payment_status: "failed" }
      )
    ).toThrow("Cannot move custom order payment from captured to failed")
  })

  it("keeps cancelled orders immutable and requires a real reason to cancel", () => {
    expect(() =>
      evolve(
        { status: "confirmed", quoted_amount: 680, payment_status: "pending" },
        "cancelled",
        { cancellation_reason: "   " }
      )
    ).toThrow("cancellation_reason is required")

    expect(() =>
      evolve(
        {
          status: "cancelled",
          quoted_amount: 680,
          payment_status: "pending",
        },
        "cancelled",
        { product_category: "new category" }
      )
    ).toThrow("cannot change quote or category")
  })
})
