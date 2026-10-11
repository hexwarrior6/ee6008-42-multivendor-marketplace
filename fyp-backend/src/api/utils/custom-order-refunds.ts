import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import type {
  IPaymentModuleService,
  PaymentCollectionDTO,
} from "@medusajs/framework/types"
import { MathBN, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../modules/custom-order"
import {
  paymentCollectionId,
  verifyCustomOrderPayment,
  type PaymentOrderSnapshot,
} from "../../modules/custom-order/payment"
import {
  assertRefundLedger,
  fullRefundReference,
  parsePaymentOperationBody,
  paymentOperation,
  REFUND_REFERENCE_KEY,
  type PaymentOperation,
} from "../../modules/custom-order/payment-operation"
import { WeChatPayClient } from "../../modules/wechat-pay/client"
import { resolveFullRefund } from "../../modules/wechat-pay/custom-refund"
import type { WeChatPayConfig } from "../../modules/wechat-pay/config"
import { assertCustomOrderAccess, getBackofficeAccess } from "./authz"
import { customPaymentConfig, paymentLedger } from "./custom-order-payments"

export function customRefundConfig() {
  const config = customPaymentConfig()
  if (
    config.mode === "live" &&
    process.env.CUSTOM_ORDER_LIVE_REFUNDS_ENABLED !== "true"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Live custom refunds require separate administrator enablement"
    )
  }
  return config
}

export function assertCustomRefundEligibility(
  order: PaymentOrderSnapshot,
  collection: PaymentCollectionDTO,
  config: WeChatPayConfig,
  resuming: boolean
) {
  if (order.status !== "confirmed" || order.currency_code !== "cny")
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only pre-production confirmed CNY orders can be fully refunded"
    )
  const reference = fullRefundReference(order)
  const { payment, amount, alreadyRecorded } = assertRefundLedger(
    order,
    collection,
    reference
  )
  if (payment.data?.mock !== (config.mode === "mock"))
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Payment mode changed; administrator review required"
    )
  if (alreadyRecorded && !resuming)
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Existing refund requires reconciliation of its original intent"
    )
  // A resumption can inspect the original capture after its own successful
  // refund was recorded. Only the signed provider query can confirm completion.
  const original = {
    ...collection,
    refunded_amount: 0,
    payments: [{ ...payment, refunds: [] }],
  }
  const proof = verifyCustomOrderPayment(order, original, config)
  if (
    proof.verification !== (config.mode === "mock" ? "simulated" : "verified")
  )
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "A verified full capture is required"
    )
  return { payment, amount, alreadyRecorded, reference }
}

export function refundSummary(order: PaymentOrderSnapshot) {
  const operation = paymentOperation(order)
  if (!operation || operation.kind !== "refund") return null
  return {
    kind: operation.kind,
    status: operation.status,
    mode: operation.mode,
    request_version: operation.request_version,
    reason: operation.reason,
    ...(operation.next_check_at && operation.status !== "completed"
      ? { next_check_at: operation.next_check_at }
      : {}),
    verification:
      operation.status === "completed"
        ? operation.mode === "live"
          ? "verified_refund"
          : "simulated_refund"
        : "unverified",
  }
}

export async function adminRefundOrder(req: AuthenticatedMedusaRequest) {
  const access = await getBackofficeAccess(req)
  if (!access.isPlatformAdmin)
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Only a platform administrator may refund custom orders"
    )
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, {
    allowCustomer: false,
    allowBackoffice: true,
  })
  return {
    service,
    order,
    actor: { actor_type: "admin" as const, actor_id: access.context.actor_id },
  }
}

export async function refundCustomOrder(req: AuthenticatedMedusaRequest) {
  const { service, order, actor } = await adminRefundOrder(req)
  const input = parsePaymentOperationBody(req.body, "refund")
  const existing = paymentOperation(order)
  if (existing?.kind === "refund" && existing.status === "completed") {
    if (
      ![existing.request_version, order.version].includes(input.version) ||
      existing.reason !== input.reason
    )
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Use the original refund reason and a valid version"
      )
    return { custom_order: order, refund: refundSummary(order) }
  }
  const config = customRefundConfig()
  const collectionId = paymentCollectionId(order)
  if (!collectionId)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No bound payment collection"
    )
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  // Validate against the same locked order that reserves the intent, avoiding
  // a stale preflight racing another administrator's completed refund.
  const reserved = await service.beginPaymentOperation({
    id: order.id,
    kind: "refund",
    ...input,
    actor,
    mode: config.mode,
    validate: async (locked) => {
      assertCustomRefundEligibility(
        locked,
        await paymentLedger(payment, paymentCollectionId(locked)!),
        config,
        false
      )
    },
  })
  const operationId = paymentOperation(reserved)!.id
  const updated = await service.executePaymentOperation(
    order.id,
    operationId,
    async (
      locked,
      operation
    ): Promise<
      Partial<PaymentOperation> & { status: PaymentOperation["status"] }
    > => {
      if (
        operation.mode !== config.mode ||
        operation.refund_reference !== fullRefundReference(locked)
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "The frozen refund identity or mode changed"
        )
      // Config is checked again immediately before any provider action.
      customRefundConfig()
      if (
        config.mode === "live" &&
        operation.next_check_at &&
        Date.parse(operation.next_check_at) > Date.now()
      ) {
        return {
          status: "provider_pending",
          mode: config.mode,
          next_check_at: operation.next_check_at,
        }
      }
      const ledger = await paymentLedger(payment, paymentCollectionId(locked)!)
      const {
        payment: record,
        amount,
        alreadyRecorded,
        reference,
      } = assertCustomRefundEligibility(locked, ledger, config, true)
      if (config.mode === "live") {
        const data = record.data ?? {}
        const outTradeNo = data.out_trade_no
        const transactionId = data.transaction_id
        const sessionId = record.payment_session?.id
        if (
          typeof outTradeNo !== "string" ||
          !outTradeNo ||
          typeof transactionId !== "string" ||
          !transactionId ||
          !sessionId
        )
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "Original transaction identity is incomplete"
          )
        const receipt = await resolveFullRefund(
          new WeChatPayClient(config),
          {
            reference,
            outTradeNo,
            transactionId,
            sessionId,
            minorAmount: locked.quoted_amount!,
            appId: config.appId!,
            merchantId: config.merchantId!,
          },
          operation.reason
        )
        if (receipt.status !== "SUCCESS")
          return {
            status: "provider_pending",
            mode: config.mode,
            next_check_at: new Date(Date.now() + 60000).toISOString(),
          }
      }
      if (!alreadyRecorded) {
        // Medusa 2.13.5 forwards this object to its payment entity service, but
        // UpdatePaymentDTO only declares id. The isolated HTTP suite verifies data persistence.
        const managedUpdate = {
          id: record.id,
          data: { ...record.data, [REFUND_REFERENCE_KEY]: reference },
        }
        await payment.updatePayment(managedUpdate)
        // Managed provider branch ONLY queries SUCCESS; it never submits a second refund.
        await payment.refundPayment({
          payment_id: record.id,
          amount,
          created_by: operation.actor_id,
          note: operation.reason,
        })
      }
      const latest = await paymentLedger(payment, ledger.id)
      const final = assertRefundLedger(locked, latest, reference)
      if (
        !final.alreadyRecorded ||
        !MathBN.eq(latest.refunded_amount ?? 0, amount)
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Resume the original intent to finish refund reconciliation"
        )
      return {
        status: "completed",
        mode: config.mode,
        refund_receipt_id: final.payment.refunds![0].id,
      }
    }
  )
  return { custom_order: updated, refund: refundSummary(updated) }
}

/** Generic admin refunds must not bypass pre-production/full-refund policy. */
export async function protectCustomRefund(
  req: AuthenticatedMedusaRequest,
  _res: unknown,
  next: () => void
) {
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  const record = await payment.retrievePayment(req.params.id)
  const collection = await payment.retrievePaymentCollection(
    record.payment_collection_id
  )
  if (collection.metadata?.custom_order_id)
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Use the dedicated custom-order refund endpoint"
    )
  next()
}
