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
  product_category: model.text().default("custom"),
  description: model.text(),
  budget_amount: model.number().nullable(),
  quoted_amount: model.number().nullable(),
  currency_code: model.text().default("cny"),
  status: model
    .enum(["request", "quote", "confirmed", "produced", "delivered", "cancelled"])
    .default("request"),
  metadata: model.json().nullable(),
})

export const CustomOrderMessage = model.define("custom_order_message", {
  id: model.id({ prefix: "com" }).primaryKey(),
  custom_order_id: model.text(),
  sender_type: model.enum(["customer", "artisan", "admin"]),
  sender_id: model.text().nullable(),
  message: model.text(),
  attachments: model.json().nullable(),
})
