import type { ExecArgs, IPaymentModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../modules/custom-order"
import {
  assertPaymentCollectionMatches,
  paymentCollectionId,
  type PaymentOrderSnapshot,
} from "../modules/custom-order/payment"
import { paymentOperation } from "../modules/custom-order/payment-operation"

export type PaymentAuditIssue = {
  order_id?: string
  collection_id?: string
  issue: string
}
/** Read-only inspection: never deletes collections, contacts WeChat or changes order state. */
export async function auditCustomOrderPayments(
  service: Pick<CustomOrderService, "listAndCountCustomOrderRequests">,
  payment: Pick<IPaymentModuleService, "listAndCountPaymentCollections">,
  cap = 10000
) {
  const orders: PaymentOrderSnapshot[] = []
  let truncated = false
  let totalOrders = 0
  for (let skip = 0; skip < cap; ) {
    const [page, count] = await service.listAndCountCustomOrderRequests(
      {},
      {
        skip,
        take: Math.min(500, cap - skip),
        order: { id: "ASC" },
        select: [
          "id",
          "customer_id",
          "status",
          "payment_status",
          "metadata",
          "quoted_amount",
          "currency_code",
          "version",
        ],
      }
    )
    orders.push(...page)
    totalOrders = count
    skip += page.length
    if (skip >= count || page.length < 500) break
  }
  truncated ||= totalOrders > orders.length
  const byOrder = new Map(orders.map((order) => [order.id, order]))
  const bound = new Map<string, string>()
  const issues: PaymentAuditIssue[] = []
  for (const order of orders) {
    try {
      const id = paymentCollectionId(order)
      if (id) {
        if (bound.has(id))
          issues.push({
            order_id: order.id,
            collection_id: id,
            issue: "duplicate_binding",
          })
        bound.set(id, order.id)
      }
      const operation = paymentOperation(order)
      if (operation && operation.status !== "completed")
        issues.push({
          order_id: order.id,
          ...(id ? { collection_id: id } : {}),
          issue: "pending_operation",
        })
    } catch {
      issues.push({ order_id: order.id, issue: "invalid_payment_metadata" })
    }
  }
  const seen = new Set<string>()
  let collections = 0,
    totalCollections = 0
  for (let skip = 0; skip < cap; ) {
    const [page, count] = await payment.listAndCountPaymentCollections(
      {},
      {
        skip,
        take: Math.min(500, cap - skip),
        order: { id: "ASC" },
        relations: ["payment_sessions", "payments"],
      }
    )
    totalCollections = count
    for (const collection of page) {
      collections++
      seen.add(collection.id)
      const orderId = collection.metadata?.custom_order_id
      if (typeof orderId !== "string") continue
      const order = byOrder.get(orderId)
      if (!order) {
        issues.push({
          collection_id: collection.id,
          issue:
            totalOrders > orders.length
              ? "order_outside_scan"
              : "missing_order",
        })
        continue
      }
      try {
        if (paymentCollectionId(order) !== collection.id) {
          const active =
            collection.payments?.length || collection.payment_sessions?.length
          issues.push({
            order_id: order.id,
            collection_id: collection.id,
            issue: active
              ? "unbound_collection_with_activity"
              : "unbound_collection",
          })
        } else assertPaymentCollectionMatches(order, collection)
      } catch {
        issues.push({
          order_id: order.id,
          collection_id: collection.id,
          issue: "binding_quote_mismatch",
        })
      }
    }
    skip += page.length
    if (skip >= count || page.length < 500) break
  }
  truncated ||= totalCollections > collections
  for (const [id, orderId] of bound)
    if (!seen.has(id))
      issues.push({
        order_id: orderId,
        collection_id: id,
        issue:
          totalCollections > collections
            ? "collection_outside_scan"
            : "missing_collection",
      })
  return {
    read_only: true as const,
    scanned_orders: orders.length,
    scanned_collections: collections,
    truncated,
    issues,
  }
}

export default async function audit({ container }: ExecArgs) {
  const result = await auditCustomOrderPayments(
    container.resolve(CUSTOM_ORDER_MODULE),
    container.resolve(Modules.PAYMENT)
  )
  // Only identifiers and reason codes. Never output customer/provider payloads.
  console.log(JSON.stringify(result, null, 2))
}
