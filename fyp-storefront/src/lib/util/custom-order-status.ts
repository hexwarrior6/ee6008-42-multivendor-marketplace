export type CustomOrderStatus =
  | "request"
  | "quote"
  | "confirmed"
  | "produced"
  | "delivered"
  | "cancelled"

export type CustomOrderTimelineStep = {
  status: CustomOrderStatus
  label: string
  state: "complete" | "current" | "upcoming"
}

const ORDER_FLOW: Array<{
  status: Exclude<CustomOrderStatus, "cancelled">
  label: string
}> = [
  { status: "request", label: "Request" },
  { status: "quote", label: "Quote" },
  { status: "confirmed", label: "Confirmed" },
  { status: "produced", label: "Produced" },
  { status: "delivered", label: "Delivered" },
]

export function getCustomOrderTimeline(
  currentStatus: CustomOrderStatus
): CustomOrderTimelineStep[] {
  if (currentStatus === "cancelled") {
    return [{ status: "cancelled", label: "Cancelled", state: "current" }]
  }

  const currentIndex = ORDER_FLOW.findIndex(
    ({ status }) => status === currentStatus
  )

  return ORDER_FLOW.map((step, index) => ({
    ...step,
    state:
      index < currentIndex
        ? "complete"
        : index === currentIndex
        ? "current"
        : "upcoming",
  }))
}
