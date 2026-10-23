import {
  InjectTransactionManager,
  MedusaError,
  MedusaService,
  MedusaContext,
} from "@medusajs/framework/utils"
import type { Context, PaymentCollectionDTO } from "@medusajs/framework/types"
import type { WeChatPayConfig } from "../wechat-pay/config"
import { randomUUID } from "node:crypto"
import {
  paymentOperation,
  PAYMENT_OPERATION_KEY,
  type PaymentOperation,
  type PaymentOperationKind,
  fullRefundReference,
} from "./payment-operation"
import { LockMode } from "@medusajs/framework/mikro-orm/core"
import {
  assertCustomerCustomOrderMutation,
  type CustomerConfirmation,
} from "./customer-confirmation"
import {
  assertPaymentPreparation,
  assertNoPaymentBindingInput,
  paymentCollectionId,
  PAYMENT_BINDING_KEY,
  PAYMENT_VERIFICATION_KEY,
  PAYMENT_RECEIPT_KEY,
  preservedPaymentMetadata,
  verifyCustomOrderPayment,
  type PaymentOrderSnapshot,
} from "./payment"
import {
  CustomOrderMessage,
  CustomOrderRequest,
  CustomOrderStatusHistory,
} from "./models/custom-order-request"
import {
  assertCustomOrderBusinessRules,
  type CustomOrderActor,
  type CustomOrderStatus,
} from "./state-machine"

export type CustomOrderMutation = {
  id: string
  customer_confirmation?: CustomerConfirmation
  status?: CustomOrderStatus
  quoted_amount?: number | null
  product_category?: string
  product_category_id?: string | null
  product_id?: string | null
  listing_type?: "custom_request" | "product"
  metadata?: Record<string, unknown> | null
  payment_status?: "pending" | "authorized" | "captured" | "failed"
  cancellation_reason?: string | null
  actor?: CustomOrderActor
  reason?: string | null
  // Internal callback supplied by the back-office route, never read from JSON.
  verify_payment?: (order: PaymentOrderSnapshot) => Promise<boolean>
}

export type CreateCustomOrderInput = {
  artisan_id: string
  customer_id: string
  title: string
  product_category: string
  product_category_id?: string | null
  product_id?: string | null
  listing_type?: "custom_request" | "product"
  description: string
  budget_amount?: number | null
  currency_code: string
  metadata?: Record<string, unknown> | null
  actor?: CustomOrderActor
}

export class CustomOrderService extends MedusaService({
  CustomOrderRequest,
  CustomOrderMessage,
  CustomOrderStatusHistory,
}) {
  /**
   * Update every mutable order field and append status history in one DB
   * transaction. Lock the row before reading its state: Medusa's generated
   * updater selects entities before flushing, so a version selector alone is
   * not an atomic compare-and-swap. Keep the version for stale-quote checks.
   */
  @InjectTransactionManager()
  async updateCustomOrderAtomically(
    input: CustomOrderMutation,
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveCustomOrderRequest(
      input.id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    const currentStatus = current.status as CustomOrderStatus
    const nextStatus = input.status ?? currentStatus
    const operation = paymentOperation(current)
    if (
      operation &&
      operation.status !== "completed" &&
      (nextStatus !== currentStatus || input.payment_status !== undefined)
    ) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Finish the pending payment operation before changing order state"
      )
    }
    assertNoPaymentBindingInput(input.metadata)
    const collectionId = paymentCollectionId(current)
    if (
      collectionId &&
      (input.payment_status !== undefined || nextStatus === "cancelled")
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Linked payments require a trusted payment/refund workflow; manual payment changes and cancellation are disabled"
      )
    }
    if (
      collectionId &&
      nextStatus !== currentStatus &&
      ["produced", "delivered"].includes(nextStatus)
    ) {
      if (
        current.metadata?.[PAYMENT_VERIFICATION_KEY] !== "verified" ||
        !input.verify_payment ||
        !(await input.verify_payment(current))
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "A verified real payment is required before production or delivery"
        )
      }
    }
    assertCustomerCustomOrderMutation(current, input)
    assertCustomOrderBusinessRules(current, nextStatus, input)

    const currentVersion = Number(current.version ?? 0)
    const patch: Record<string, unknown> = {
      version: currentVersion + 1,
    }
    for (const key of [
      "quoted_amount",
      "product_category",
      "product_category_id",
      "product_id",
      "listing_type",
      "metadata",
      "payment_status",
    ] as const) {
      if (input[key] !== undefined) {
        patch[key] = input[key]
      }
    }
    if (input.metadata !== undefined && collectionId) {
      patch.metadata = {
        ...input.metadata,
        ...preservedPaymentMetadata(current.metadata),
      }
    }

    if (nextStatus !== currentStatus) {
      patch.status = nextStatus
      if (nextStatus === "delivered") {
        patch.delivered_at = new Date()
      }
      if (nextStatus === "cancelled") {
        patch.cancelled_at = new Date()
        patch.cancelled_by = input.actor?.actor_id ?? null
        patch.cancellation_reason = input.cancellation_reason?.trim() || null
      }
    }

    const updated = await this.updateCustomOrderRequests(
      {
        selector: { id: current.id, version: currentVersion },
        data: patch,
      },
      sharedContext
    )
    const result = Array.isArray(updated) ? updated[0] : updated
    if (!result) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The custom order was updated by another request. Please retry."
      )
    }

    if (nextStatus !== currentStatus) {
      const historyReason =
        nextStatus === "cancelled"
          ? input.cancellation_reason?.trim() || input.reason?.trim() || null
          : input.reason?.trim() || null
      await this.createCustomOrderStatusHistories(
        {
          custom_order_id: current.id,
          from_status: currentStatus,
          to_status: nextStatus,
          actor_type: input.actor?.actor_type ?? "system",
          actor_id: input.actor?.actor_id ?? null,
          reason: historyReason,
        },
        sharedContext
      )
    }

    return result
  }

  /** Bind a server-created collection once, with the same row lock as status updates. */
  @InjectTransactionManager()
  async bindPaymentCollection(
    input: {
      id: string
      customer_id: string
      collection_id: string
      version: number
    },
    @MedusaContext() sharedContext?: Context
  ) {
    if (!/^pay_col_[a-zA-Z0-9]+$/.test(input.collection_id)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid payment collection ID"
      )
    }
    const current = await this.retrieveCustomOrderRequest(
      input.id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    assertPaymentPreparation(current, input.customer_id)
    if (paymentCollectionId(current)) return current
    if (current.version !== input.version) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The custom order changed; refresh before preparing payment"
      )
    }
    const updated = await this.updateCustomOrderRequests(
      {
        id: current.id,
        metadata: {
          ...current.metadata,
          [PAYMENT_BINDING_KEY]: input.collection_id,
        },
        version: current.version + 1,
      },
      sharedContext
    )
    return updated
  }

  /** Serialize session preparation across all app processes using the order row. */
  @InjectTransactionManager()
  async withLockedPaymentOrder<T>(
    id: string,
    customerId: string,
    work: (order: PaymentOrderSnapshot) => Promise<T>,
    @MedusaContext() sharedContext?: Context
  ): Promise<T> {
    const current = await this.retrieveCustomOrderRequest(
      id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    assertPaymentPreparation(current, customerId)
    if (!paymentCollectionId(current))
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Prepare a payment collection first"
      )
    return work(current)
  }

  /** Re-read ledger under the order lock so duplicate/out-of-order events are harmless. */
  @InjectTransactionManager()
  async reconcilePaymentCollection(
    id: string,
    loadCollection: (id: string) => Promise<PaymentCollectionDTO>,
    config?: Pick<WeChatPayConfig, "mode" | "appId" | "merchantId">,
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveCustomOrderRequest(
      id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    const collectionId = paymentCollectionId(current)
    if (!collectionId)
      return { custom_order: current, verification: "unverified" as const }
    const proof = verifyCustomOrderPayment(
      current,
      await loadCollection(collectionId),
      config
    )
    const metadata = {
      ...current.metadata,
      [PAYMENT_VERIFICATION_KEY]: proof.verification,
      ...(proof.receipt_id ? { [PAYMENT_RECEIPT_KEY]: proof.receipt_id } : {}),
    }
    const paid = proof.verification === "verified"
    const changed =
      current.metadata?.[PAYMENT_VERIFICATION_KEY] !== proof.verification ||
      (paid && current.payment_status !== "captured") ||
      (proof.receipt_id &&
        current.metadata?.[PAYMENT_RECEIPT_KEY] !== proof.receipt_id)
    if (!changed)
      return { custom_order: current, verification: proof.verification }
    // Preserve terminal business states and payment audit markers after refunds.
    // Verification becomes review_required and the production gate stays closed.
    const updated = await this.updateCustomOrderRequests(
      {
        id,
        metadata,
        version: current.version + 1,
        ...(paid ? { payment_status: "captured" as const } : {}),
      },
      sharedContext
    )
    return { custom_order: updated, verification: proof.verification }
  }

  /** Commit intent BEFORE provider calls; a crash leaves a resumable, state-blocking record. */
  @InjectTransactionManager()
  async beginPaymentOperation(
    input: {
      id: string
      kind: PaymentOperationKind
      version: number
      reason: string
      actor: CustomOrderActor
      mode?: "mock" | "live"
      validate?: (order: PaymentOrderSnapshot) => Promise<void>
    },
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveCustomOrderRequest(
      input.id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    if (
      input.actor.actor_type !== "admin" &&
      (input.actor.actor_type !== "customer" ||
        current.customer_id !== input.actor.actor_id ||
        input.kind === "refund")
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This actor cannot perform the payment operation"
      )
    }
    const existing = paymentOperation(current)
    if (
      existing &&
      existing.kind === input.kind &&
      (existing.request_version === input.version ||
        (existing.kind === "refund" && current.version === input.version))
    ) {
      if (
        existing.reason !== input.reason ||
        (existing.mode && existing.mode !== input.mode)
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Resume the original operation with the same reason and payment mode"
        )
      return current
    }
    if (existing && existing.status !== "completed")
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Another payment operation must be resumed first"
      )
    if (current.version !== input.version)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The order changed; refresh before continuing"
      )
    if (current.status !== "confirmed" || !paymentCollectionId(current))
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Only a confirmed linked order can perform this operation"
      )
    if (input.kind === "refund" && !input.mode)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A frozen payment mode is required"
      )
    await input.validate?.(current)
    const operation: PaymentOperation = {
      id: randomUUID(),
      kind: input.kind,
      status: "requested",
      request_version: input.version,
      reason: input.reason,
      actor_id: input.actor.actor_id,
      actor_type: input.actor.actor_type as "customer" | "admin",
      created_at: new Date().toISOString(),
      ...(input.kind === "refund"
        ? { mode: input.mode, refund_reference: fullRefundReference(current) }
        : {}),
    }
    return this.updateCustomOrderRequests(
      {
        id: current.id,
        metadata: { ...current.metadata, [PAYMENT_OPERATION_KEY]: operation },
        version: current.version + 1,
      },
      sharedContext
    )
  }

  /** Serialize resumptions. Never roll back the separately committed intent on provider failure. */
  @InjectTransactionManager()
  async executePaymentOperation(
    id: string,
    operationId: string,
    work: (
      order: PaymentOrderSnapshot,
      operation: PaymentOperation
    ) => Promise<
      Partial<PaymentOperation> & { status: PaymentOperation["status"] }
    >,
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveCustomOrderRequest(
      id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    const operation = paymentOperation(current)
    if (!operation || operation.id !== operationId)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The payment operation changed"
      )
    if (operation.status === "completed") return current
    if (current.status !== "confirmed")
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Payment operation requires manual review"
      )
    const result = await work(current, operation)
    if (operation.mode && result.mode && operation.mode !== result.mode)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Payment operation mode changed"
      )
    const completed = result.status === "completed"
    if (
      !completed &&
      JSON.stringify({ ...operation, ...result }) === JSON.stringify(operation)
    )
      return current
    const metadata = {
      ...current.metadata,
      ...(operation.kind === "refund" && completed
        ? {
            [PAYMENT_VERIFICATION_KEY]: "review_required",
            __custom_order_payment_refund_verification:
              operation.mode === "live"
                ? "verified_refund"
                : "simulated_refund",
          }
        : {}),
      [PAYMENT_OPERATION_KEY]: {
        ...operation,
        ...result,
        ...(completed ? { completed_at: new Date().toISOString() } : {}),
      },
    }
    const cancel = completed && operation.kind !== "retry"
    const updated = await this.updateCustomOrderRequests(
      {
        id,
        metadata,
        version: current.version + 1,
        ...(cancel
          ? {
              status: "cancelled" as const,
              cancelled_at: new Date(),
              cancelled_by: operation.actor_id,
              cancellation_reason: operation.reason,
            }
          : {}),
      },
      sharedContext
    )
    if (cancel)
      await this.createCustomOrderStatusHistories(
        {
          custom_order_id: id,
          from_status: current.status,
          to_status: "cancelled",
          actor_type: operation.actor_type,
          actor_id: operation.actor_id,
          reason: operation.reason,
        },
        sharedContext
      )
    return updated
  }

  @InjectTransactionManager()
  async createCustomOrderWithHistory(
    input: CreateCustomOrderInput,
    @MedusaContext() sharedContext?: Context
  ) {
    assertNoPaymentBindingInput(input.metadata)
    const created = await this.createCustomOrderRequests(
      {
        artisan_id: input.artisan_id,
        customer_id: input.customer_id,
        title: input.title,
        product_category: input.product_category,
        product_category_id: input.product_category_id ?? null,
        product_id: input.product_id ?? null,
        listing_type: input.listing_type ?? "custom_request",
        description: input.description,
        budget_amount: input.budget_amount ?? null,
        currency_code: input.currency_code,
        metadata: input.metadata ?? null,
        status: "request",
      },
      sharedContext
    )
    const result = Array.isArray(created) ? created[0] : created
    await this.createCustomOrderStatusHistories(
      {
        custom_order_id: result.id,
        from_status: null,
        to_status: "request",
        actor_type: input.actor?.actor_type ?? "customer",
        actor_id: input.actor?.actor_id ?? input.customer_id,
        reason: "Custom order created",
      },
      sharedContext
    )
    return result
  }

  @InjectTransactionManager()
  async deleteCustomOrderWithRelations(
    id: string,
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveCustomOrderRequest(
      id,
      { options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } },
      sharedContext
    )
    if (paymentCollectionId(current)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Orders with a linked payment collection cannot be deleted"
      )
    }
    const [messages, histories] = await Promise.all([
      this.listCustomOrderMessages({ custom_order_id: id }, {}, sharedContext),
      this.listCustomOrderStatusHistories(
        { custom_order_id: id },
        {},
        sharedContext
      ),
    ])
    if (messages.length) {
      await this.deleteCustomOrderMessages(
        messages.map((item) => item.id),
        sharedContext
      )
    }
    if (histories.length) {
      await this.deleteCustomOrderStatusHistories(
        histories.map((item) => item.id),
        sharedContext
      )
    }
    await this.deleteCustomOrderRequests(id, sharedContext)
  }
}
