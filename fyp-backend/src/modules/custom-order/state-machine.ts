import { MedusaError } from "@medusajs/framework/utils"

export const CUSTOM_ORDER_STATUSES = [
  "request",
  "quote",
  "confirmed",
  "produced",
  "delivered",
  "cancelled",
] as const

export type CustomOrderStatus = (typeof CUSTOM_ORDER_STATUSES)[number]

export const CUSTOM_ORDER_TRANSITIONS: Record<
  CustomOrderStatus,
  readonly CustomOrderStatus[]
> = {
  request: ["quote", "cancelled"],
  quote: ["confirmed", "cancelled"],
  confirmed: ["produced", "cancelled"],
  produced: ["delivered"],
  delivered: [],
  cancelled: [],
}

export const isCustomOrderStatus = (
  value: unknown
): value is CustomOrderStatus =>
  typeof value === "string" &&
  CUSTOM_ORDER_STATUSES.includes(value as CustomOrderStatus)

export const assertCustomOrderTransition = (
  current: CustomOrderStatus,
  next: CustomOrderStatus
) => {
  if (!isCustomOrderStatus(current) || !isCustomOrderStatus(next)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid custom order status"
    )
  }

  if (current === next) {
    return
  }

  if (!CUSTOM_ORDER_TRANSITIONS[current].includes(next)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Cannot move custom order from ${current} to ${next}`
    )
  }
}
