import {
  defaultCurrencies,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils"
import { MAX_CUSTOM_ORDER_AMOUNT } from "./constants"
import type { PaymentCollectionDTO } from "@medusajs/framework/types"
import type { WeChatPayConfig } from "../wechat-pay/config"
import { paymentOperation } from "./payment-operation"

export type PaymentOrderSnapshot = {
  id: string
  customer_id?: string | null
  status: string
  payment_status: string
  metadata?: Record<string, unknown> | null
  quoted_amount?: number | null
  currency_code: string
  version: number
}

// Reserved metadata keeps this preparatory phase deployable without a business
// schema migration. Only bindPaymentCollection may write this key.
export const PAYMENT_BINDING_KEY = "__custom_order_payment_collection_id"
export const PAYMENT_VERIFICATION_KEY = "__custom_order_payment_verification"
export const PAYMENT_RECEIPT_KEY = "__custom_order_payment_receipt_id"
export const PAYMENT_METADATA_PREFIX = "__custom_order_payment_"
export const CUSTOM_WECHAT_PROVIDER = "pp_wechat_wechat"

export function preservedPaymentMetadata(
  metadata?: Record<string, unknown> | null
) {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key]) =>
      key.startsWith(PAYMENT_METADATA_PREFIX)
    )
  )
}

export function paymentCollectionId(
  order: Pick<PaymentOrderSnapshot, "metadata">
): string | null {
  const value = order.metadata?.[PAYMENT_BINDING_KEY]
  if (value === undefined) return null
  if (typeof value !== "string" || !/^pay_col_[a-zA-Z0-9]+$/.test(value)) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Invalid server-managed payment binding; administrator review required"
    )
  }
  return value
}

export function assertNoPaymentBindingInput(
  metadata?: Record<string, unknown> | null
) {
  if (
    metadata &&
    Object.keys(metadata).some((key) => key.startsWith(PAYMENT_METADATA_PREFIX))
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Payment binding metadata is server-managed"
    )
  }
}

export function assertPaymentCollectionMatches(
  order: PaymentOrderSnapshot,
  collection: PaymentCollectionDTO
) {
  if (
    collection.id !== paymentCollectionId(order) ||
    collection.metadata?.custom_order_id !== order.id ||
    collection.currency_code !== order.currency_code ||
    !MathBN.eq(
      collection.amount,
      customOrderPaymentAmount(order.quoted_amount, order.currency_code)
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Payment collection does not match the accepted quote"
    )
  }
}

export type PaymentVerification =
  | "unverified"
  | "simulated"
  | "verified"
  | "review_required"

/** Read only the server ledger; never accept a payment state from a browser. */
export function verifyCustomOrderPayment(
  order: PaymentOrderSnapshot,
  collection: PaymentCollectionDTO,
  config?: Pick<WeChatPayConfig, "mode" | "appId" | "merchantId">
) {
  assertPaymentCollectionMatches(order, collection)
  const result = (verification: PaymentVerification, receipt_id?: string) => ({
    verification,
    receipt_id,
  })
  const payments = collection.payments ?? []
  if (
    MathBN.gt(collection.refunded_amount ?? 0, 0) ||
    payments.some((p) => p.canceled_at || p.refunds?.length)
  ) {
    return result("review_required")
  }
  if (
    payments.some(
      (p) => p.provider_id === "pp_system_default" || p.data?.mock === true
    ) ||
    collection.payment_sessions?.some((s) => s.data?.mock === true)
  )
    return result("simulated")
  if (!payments.length) return result("unverified")
  if (
    payments.length !== 1 ||
    !config ||
    config.mode !== "live" ||
    !config.appId ||
    !config.merchantId
  ) {
    return result("review_required")
  }
  const payment = payments[0]
  const data = payment.data ?? {}
  const sessionId = payment.payment_session?.id
  const receiptAmount = data.amount as
    | { total?: number; currency?: string }
    | undefined
  const expected = customOrderPaymentAmount(
    order.quoted_amount,
    order.currency_code
  )
  if (
    payment.provider_id !== CUSTOM_WECHAT_PROVIDER ||
    order.currency_code !== "cny" ||
    payment.currency_code !== "cny" ||
    !MathBN.eq(payment.amount, expected) ||
    data.mock !== false ||
    data.trade_state !== "SUCCESS" ||
    data.appid !== config.appId ||
    data.mchid !== config.merchantId ||
    typeof data.transaction_id !== "string" ||
    !data.transaction_id ||
    !sessionId ||
    data.session_id !== sessionId ||
    data.attach !== sessionId ||
    receiptAmount?.total !== order.quoted_amount ||
    receiptAmount?.currency !== "CNY"
  ) {
    return result("review_required")
  }
  let captured = MathBN.add(0, 0)
  for (const capture of payment.captures ?? []) {
    if (!MathBN.gt(capture.amount, 0)) return result("review_required")
    captured = MathBN.add(captured, capture.amount)
  }
  // An authorization alone is not enough for bespoke production.
  if (
    !payment.captured_at ||
    !MathBN.eq(captured, expected) ||
    !MathBN.eq(collection.captured_amount ?? 0, expected)
  )
    return result("unverified")
  return result("verified", payment.id)
}

/** Custom quotes use minor units; Medusa payment collections use major units. */
export function customOrderPaymentAmount(
  amount: number | null | undefined,
  currency: string
) {
  const definition = defaultCurrencies[currency.toUpperCase()]
  if (
    !definition ||
    !/^[a-z]{3}$/.test(currency) ||
    !Number.isInteger(amount) ||
    Number(amount) <= 0 ||
    Number(amount) > MAX_CUSTOM_ORDER_AMOUNT
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A valid quote and supported currency are required"
    )
  }
  return MathBN.div(Number(amount), 10 ** definition.decimal_digits).toNumber()
}

export function assertPaymentPreparation(
  order: PaymentOrderSnapshot,
  customerId: string
) {
  const operation = paymentOperation(order)
  if (operation && operation.status !== "completed") {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "A payment operation is pending; refresh or resume it first"
    )
  }
  if (order.customer_id !== customerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can only access your own custom orders"
    )
  }
  if (
    order.status !== "confirmed" ||
    !["pending", "failed"].includes(order.payment_status)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only confirmed, unpaid custom orders can prepare payment"
    )
  }
  return customOrderPaymentAmount(order.quoted_amount, order.currency_code)
}
