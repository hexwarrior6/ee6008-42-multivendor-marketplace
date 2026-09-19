import {
  InjectTransactionManager,
  MedusaError,
  MedusaService,
  MedusaContext,
} from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
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
   * transaction. The version selector provides optimistic concurrency
   * protection when two users update the same order simultaneously.
   */
  @InjectTransactionManager()
  async updateCustomOrderAtomically(
    input: CustomOrderMutation,
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveCustomOrderRequest(
      input.id,
      undefined,
      sharedContext
    )
    const currentStatus = current.status as CustomOrderStatus
    const nextStatus = input.status ?? currentStatus
    const customerAttemptedRestrictedChange =
      input.actor?.actor_type === "customer" &&
      (nextStatus !== currentStatus ||
        input.quoted_amount !== undefined ||
        input.product_category !== undefined ||
        input.product_category_id !== undefined ||
        input.product_id !== undefined ||
        input.listing_type !== undefined ||
        input.payment_status !== undefined ||
        input.cancellation_reason !== undefined)
    if (customerAttemptedRestrictedChange) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Customers cannot quote or change the custom order workflow"
      )
    }
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
      const historyReason = nextStatus === "cancelled"
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

  @InjectTransactionManager()
  async createCustomOrderWithHistory(
    input: CreateCustomOrderInput,
    @MedusaContext() sharedContext?: Context
  ) {
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
    await this.retrieveCustomOrderRequest(id, undefined, sharedContext)
    const [messages, histories] = await Promise.all([
      this.listCustomOrderMessages({ custom_order_id: id }, {}, sharedContext),
      this.listCustomOrderStatusHistories({ custom_order_id: id }, {}, sharedContext),
    ])
    if (messages.length) {
      await this.deleteCustomOrderMessages(messages.map((item) => item.id), sharedContext)
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
