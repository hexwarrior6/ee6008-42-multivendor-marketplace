import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../../../modules/custom-order"
import { aggregateCustomPayments } from "../../../../modules/custom-order/payment-analytics"
import {
  paymentCollectionId,
  type PaymentOrderSnapshot,
} from "../../../../modules/custom-order/payment"
import { customOrderAnalyticsScope } from "../custom-orders/route"
import {
  customPaymentConfig,
  paymentLedger,
} from "../../../utils/custom-order-payments"

const MAX_LEDGER_ORDERS = 200
/** Read-only current ledger snapshot, explicitly NOT a settlement/cash-flow report. */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { from, to, currencyCode, artisanIds } =
    await customOrderAnalyticsScope(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  const [orders, count] =
    artisanIds && !artisanIds.length
      ? [[], 0]
      : await service.listAndCountCustomOrderRequests(
          {
            ...(artisanIds ? { artisan_id: artisanIds } : {}),
            currency_code: currencyCode,
            created_at: { $gte: from, $lte: to },
          },
          {
            take: MAX_LEDGER_ORDERS,
            order: { created_at: "ASC", id: "ASC" },
            select: [
              "id",
              "customer_id",
              "status",
              "payment_status",
              "quoted_amount",
              "currency_code",
              "metadata",
              "version",
            ],
          }
        )
  let config: ReturnType<typeof customPaymentConfig> | undefined
  try {
    config = customPaymentConfig()
  } catch {
    /* fail closed; no live receipt may be accepted */
  }
  const rows: Parameters<typeof aggregateCustomPayments>[0] = []
  let ledgerUnavailable = 0
  for (let start = 0; start < orders.length; start += 10) {
    const page = await Promise.all(
      orders
        .slice(start, start + 10)
        .map(async (order: PaymentOrderSnapshot) => {
          try {
            const id = paymentCollectionId(order)
            return {
              order,
              ...(id ? { collection: await paymentLedger(payment, id) } : {}),
            }
          } catch {
            ledgerUnavailable++
            return { order }
          }
        })
    )
    rows.push(...page)
  }
  const summary = aggregateCustomPayments(rows, config)
  res.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    currency_code: currencyCode,
    basis: "current_verified_unrefunded_captures_for_orders_created_in_period",
    amount_unit: "major",
    financial_report: false,
    summary,
    scanned_orders: orders.length,
    matched_orders: count,
    ledger_unavailable_orders: ledgerUnavailable,
    complete:
      count <= MAX_LEDGER_ORDERS &&
      ledgerUnavailable === 0 &&
      summary.review_required_orders === 0,
    truncated: count > MAX_LEDGER_ORDERS,
  })
}
