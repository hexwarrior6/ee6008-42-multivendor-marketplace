import { MedusaError } from "@medusajs/framework/utils"
import { MAX_CUSTOM_ORDER_AMOUNT } from "./constants"

export type CustomOrderActor = {
  actor_type: "customer" | "artisan" | "admin"
  actor_id: string
}

export const CUSTOM_ORDER_STATUSES = [
  "request",
  "quote",
  "confirmed",
  "produced",
  "delivered",
  "cancelled",
] as const

export type CustomOrderStatus = (typeof CUSTOM_ORDER_STATUSES)[number]

export type CustomOrderPaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"

export const CUSTOM_ORDER_PAYMENT_TRANSITIONS: Record<
  CustomOrderPaymentStatus,
  readonly CustomOrderPaymentStatus[]
> = {
  pending: ["authorized", "captured", "failed"],
  authorized: ["captured", "failed"],
  captured: [],
  // A failed payment may be retried through a new provider attempt.
  failed: ["pending", "authorized", "captured"],
}

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

type CustomOrderSnapshot = {
  status: CustomOrderStatus
  quoted_amount?: number | string | null
  payment_status?: CustomOrderPaymentStatus | null
  product_id?: string | null
  listing_type?: "custom_request" | "product" | null
}

type CustomOrderMutationInput = {
  quoted_amount?: number | null
  product_category?: string
  product_category_id?: string | null
  product_id?: string | null
  listing_type?: "custom_request" | "product"
  payment_status?: CustomOrderPaymentStatus
  cancellation_reason?: string | null
}

/** Business invariants shared by all order mutation callers. */
export const assertCustomOrderBusinessRules = (
  current: CustomOrderSnapshot,
  next: CustomOrderStatus,
  input: CustomOrderMutationInput
) => {
  assertCustomOrderTransition(current.status, next)

  const terminal = current.status === "delivered" || current.status === "cancelled"
  const changesQuoteOrCategory =
    input.quoted_amount !== undefined ||
    input.product_category !== undefined ||
    input.product_category_id !== undefined ||
    input.product_id !== undefined ||
    input.listing_type !== undefined
  if (terminal && changesQuoteOrCategory) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Delivered or cancelled orders cannot change quote or category"
    )
  }

  const currentPaymentStatus = current.payment_status ?? "pending"
  if (
    input.payment_status !== undefined &&
    input.payment_status !== currentPaymentStatus
  ) {
    if (terminal) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Delivered or cancelled orders cannot change payment status"
      )
    }
    if (!CUSTOM_ORDER_PAYMENT_TRANSITIONS[currentPaymentStatus].includes(
      input.payment_status
    )) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot move custom order payment from ${currentPaymentStatus} to ${input.payment_status}`
      )
    }
  }

  const quotedAmount = input.quoted_amount !== undefined
    ? input.quoted_amount
    : current.quoted_amount
  const normalizedQuote = quotedAmount === null || quotedAmount === undefined
    ? null
    : Number(quotedAmount)

  if (input.quoted_amount !== undefined &&
    (normalizedQuote !== null &&
      (!Number.isFinite(normalizedQuote) ||
        !Number.isInteger(normalizedQuote) ||
        normalizedQuote < 0 ||
        normalizedQuote > MAX_CUSTOM_ORDER_AMOUNT))) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `quoted_amount must be a non-negative integer no greater than ${MAX_CUSTOM_ORDER_AMOUNT} in the smallest currency unit`
    )
  }

  if (next === "quote" &&
    (normalizedQuote === null || !Number.isFinite(normalizedQuote) ||
      !Number.isInteger(normalizedQuote) || normalizedQuote <= 0)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A positive quoted_amount is required before moving to quote"
    )
  }
  const effectiveListingType = input.listing_type ?? current.listing_type ?? "custom_request"
  const effectiveProductId = input.product_id !== undefined
    ? input.product_id
    : current.product_id
  if (effectiveListingType === "product" && !effectiveProductId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "listing_type=product requires product_id"
    )
  }
  if (next === "confirmed" &&
    (normalizedQuote === null || !Number.isFinite(normalizedQuote) ||
      !Number.isInteger(normalizedQuote) || normalizedQuote <= 0)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A valid quote is required before confirmation"
    )
  }
  if (["confirmed", "produced", "delivered"].includes(current.status) &&
    input.quoted_amount !== undefined) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The quote cannot be changed after confirmation"
    )
  }
  if (next === "produced" &&
    !["authorized", "captured"].includes(
      input.payment_status ?? current.payment_status ?? "pending"
    )) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Payment must be authorized or captured before production"
    )
  }
  if (next === "delivered" && current.status !== "produced") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only produced orders can be delivered"
    )
  }
  if (next === "cancelled" && !input.cancellation_reason?.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "cancellation_reason is required when cancelling an order"
    )
  }
}
