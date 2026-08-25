import { model } from "@medusajs/framework/utils"

/**
 * A buyer's request for a bespoke product. The status values are deliberately
 * small and explicit so the storefront and the future chat integration can
 * share the same state machine.
 */
export const CustomOrderRequest = model.define("custom_order_request", {
  id: model.id({ prefix: "cor" }).primaryKey(),
  artisan_id: model.text(),
  customer_id: model.text().nullable(),
  title: model.text(),
  description: model.text(),
  budget_amount: model.number().nullable(),
  quoted_amount: model.number().nullable(),
  currency_code: model.text().default("cny"),
  status: model
    .enum(["request", "quote", "confirmed", "produced", "delivered", "cancelled"])
    .default("request"),
  metadata: model.json().nullable(),
})
