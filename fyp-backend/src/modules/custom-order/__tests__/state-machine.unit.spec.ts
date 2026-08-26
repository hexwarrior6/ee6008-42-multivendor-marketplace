import {
  assertCustomOrderTransition,
  CUSTOM_ORDER_STATUSES,
  CUSTOM_ORDER_TRANSITIONS,
  isCustomOrderStatus,
} from "../state-machine"

describe("custom order state machine", () => {
  it("exposes the complete bespoke order lifecycle", () => {
    expect(CUSTOM_ORDER_STATUSES).toEqual([
      "request",
      "quote",
      "confirmed",
      "produced",
      "delivered",
      "cancelled",
    ])
  })

  it("allows the forward lifecycle and cancellation before production", () => {
    expect(CUSTOM_ORDER_TRANSITIONS.request).toEqual(["quote", "cancelled"])
    expect(CUSTOM_ORDER_TRANSITIONS.quote).toEqual(["confirmed", "cancelled"])
    expect(CUSTOM_ORDER_TRANSITIONS.confirmed).toEqual([
      "produced",
      "cancelled",
    ])
    expect(CUSTOM_ORDER_TRANSITIONS.produced).toEqual(["delivered"])

    expect(() => assertCustomOrderTransition("request", "quote")).not.toThrow()
    expect(() => assertCustomOrderTransition("confirmed", "cancelled")).not.toThrow()
    expect(() => assertCustomOrderTransition("delivered", "delivered")).not.toThrow()
  })

  it("rejects skipped or reverse transitions", () => {
    expect(() => assertCustomOrderTransition("request", "produced")).toThrow(
      "Cannot move custom order from request to produced"
    )
    expect(() => assertCustomOrderTransition("delivered", "confirmed")).toThrow(
      "Cannot move custom order from delivered to confirmed"
    )
    expect(() =>
      assertCustomOrderTransition("not-a-status" as never, "quote")
    ).toThrow("Invalid custom order status")
  })

  it("recognizes only supported status values", () => {
    expect(isCustomOrderStatus("request")).toBe(true)
    expect(isCustomOrderStatus("delivered")).toBe(true)
    expect(isCustomOrderStatus("production")).toBe(false)
    expect(isCustomOrderStatus(undefined)).toBe(false)
  })
})
