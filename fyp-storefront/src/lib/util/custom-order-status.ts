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
  { status: "request", label: "提交需求" },
  { status: "quote", label: "报价" },
  { status: "confirmed", label: "已确认" },
  { status: "produced", label: "已生产" },
  { status: "delivered", label: "已交付" },
]

export function getCustomOrderTimeline(
  currentStatus: CustomOrderStatus
): CustomOrderTimelineStep[] {
  if (currentStatus === "cancelled") {
    return [{ status: "cancelled", label: "已取消", state: "current" }]
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
