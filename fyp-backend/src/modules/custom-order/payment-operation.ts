import { createHash } from "node:crypto"
import { MathBN, MedusaError } from "@medusajs/framework/utils"
import type { PaymentCollectionDTO } from "@medusajs/framework/types"
import {
  assertPaymentCollectionMatches,
  customOrderPaymentAmount,
  type PaymentOrderSnapshot,
} from "./payment"

export const PAYMENT_OPERATION_KEY = "__custom_order_payment_operation"
export const REFUND_REFERENCE_KEY = "__custom_order_refund_reference"
export type PaymentOperationKind = "cancel" | "refund" | "retry"
export type PaymentOperation = {
  id: string
  kind: PaymentOperationKind
  status: "requested" | "provider_pending" | "completed"
  request_version: number
  reason: string
  actor_id: string
  actor_type: "customer" | "admin"
  created_at: string
  mode?: "mock" | "live"
  refund_reference?: string
  refund_receipt_id?: string
  completed_at?: string
  next_check_at?: string
}

export function paymentOperation(
  order: Pick<PaymentOrderSnapshot, "metadata">
): PaymentOperation | undefined {
  const value = order.metadata?.[PAYMENT_OPERATION_KEY]
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Invalid payment operation"
    )
  const operation = value as PaymentOperation
  if (
    !operation.id ||
    !["cancel", "refund", "retry"].includes(operation.kind) ||
    !["requested", "provider_pending", "completed"].includes(
      operation.status
    ) ||
    !Number.isInteger(operation.request_version)
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Invalid payment operation"
    )
  }
  return operation
}

export function parsePaymentOperationBody(
  body: unknown,
  kind: PaymentOperationKind
) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "version and reason are required"
    )
  const input = body as Record<string, unknown>
  const keys = kind === "retry" ? ["version"] : ["version", "reason"]
  if (
    Object.keys(input).some((key) => !keys.includes(key)) ||
    !Number.isInteger(input.version) ||
    Number(input.version) < 0 ||
    (kind !== "retry" &&
      (typeof input.reason !== "string" ||
        !input.reason.trim() ||
        input.reason.trim().length > 1000))
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A current version and valid reason are required; payment fields are server-managed"
    )
  }
  return {
    version: Number(input.version),
    reason:
      kind === "retry"
        ? "Buyer requested a fresh payment session"
        : (input.reason as string).trim(),
  }
}

/** A full pre-production refund has one stable provider reference, including after a crash. */
export function fullRefundReference(order: PaymentOrderSnapshot) {
  return `CR${createHash("sha256")
    .update(
      `${order.id}:${order.metadata?.__custom_order_payment_collection_id}:full`
    )
    .digest("hex")
    .slice(0, 30)}`
}

export function assertUnpaidCollection(
  order: PaymentOrderSnapshot,
  collection: PaymentCollectionDTO
) {
  assertPaymentCollectionMatches(order, collection)
  if (
    collection.payments?.length ||
    !MathBN.eq(collection.authorized_amount ?? 0, 0) ||
    !MathBN.eq(collection.captured_amount ?? 0, 0) ||
    !MathBN.eq(collection.refunded_amount ?? 0, 0) ||
    (collection.payment_sessions?.length ?? 0) > 1
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Payment activity requires a refund or administrator review; cancellation/retry refused"
    )
  }
}

export function assertFullCapture(
  order: PaymentOrderSnapshot,
  collection: PaymentCollectionDTO
) {
  assertPaymentCollectionMatches(order, collection)
  const payment = collection.payments?.[0]
  const amount = customOrderPaymentAmount(
    order.quoted_amount,
    order.currency_code
  )
  if (
    collection.payments?.length !== 1 ||
    !payment ||
    payment.canceled_at ||
    !payment.captured_at ||
    payment.provider_id !== "pp_wechat_wechat" ||
    !MathBN.eq(payment.amount, amount) ||
    !MathBN.eq(collection.captured_amount ?? 0, amount) ||
    !MathBN.eq(
      (payment.captures ?? []).reduce(
        (sum, capture) => MathBN.add(sum, capture.amount),
        MathBN.convert(0)
      ),
      amount
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "A single fully captured WeChat payment is required for a full refund"
    )
  }
  return { payment, amount }
}

export function assertRefundLedger(
  order: PaymentOrderSnapshot,
  collection: PaymentCollectionDTO,
  reference: string
) {
  const { payment, amount } = assertFullCapture(order, collection)
  const refunds = payment.refunds ?? []
  if (
    refunds.length > 1 ||
    (refunds.length === 1 &&
      (!MathBN.eq(refunds[0].amount, amount) ||
        !MathBN.eq(collection.refunded_amount ?? 0, amount) ||
        payment.data?.out_refund_no !== reference ||
        payment.data?.refund_status !== "SUCCESS")) ||
    (!refunds.length && !MathBN.eq(collection.refunded_amount ?? 0, 0))
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Existing refund activity requires administrator review"
    )
  }
  return { payment, amount, alreadyRecorded: refunds.length === 1 }
}
