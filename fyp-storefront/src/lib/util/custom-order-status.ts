export type CustomOrderStatus =
  | "request"
  | "quote"
  | "confirmed"
  | "produced"
  | "delivered"
  | "cancelled"

export type CustomOrderTimelineStep = {
  status: CustomOrderStatus
  state: "complete" | "current" | "upcoming"
}

const ORDER_FLOW: Array<Exclude<CustomOrderStatus, "cancelled">> = [
  "request",
  "quote",
  "confirmed",
  "produced",
  "delivered",
]

export function getCustomOrderTimeline(
  currentStatus: CustomOrderStatus
): CustomOrderTimelineStep[] {
  if (currentStatus === "cancelled") {
    return [{ status: "cancelled", state: "current" }]
  }

  const currentIndex = ORDER_FLOW.indexOf(currentStatus)

  return ORDER_FLOW.map((status, index) => ({
    status,
    state:
      index < currentIndex
        ? "complete"
        : index === currentIndex
        ? "current"
        : "upcoming",
  }))
}
