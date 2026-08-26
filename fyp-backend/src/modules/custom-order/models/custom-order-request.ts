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
  // product_category is the request classification. product_category_id can
  // point at Medusa's formal Product Category when a listing is used.
  product_category: model.text().default("custom"),
  product_category_id: model.text().nullable(),
  product_id: model.text().nullable(),
  listing_type: model
    .enum(["custom_request", "product"])
    .default("custom_request"),
  description: model.text(),
  budget_amount: model.number().nullable(),
  quoted_amount: model.number().nullable(),
  currency_code: model.text().default("cny"),
  status: model
    .enum(["request", "quote", "confirmed", "produced", "delivered", "cancelled"])
    .default("request"),
  payment_status: model
    .enum(["pending", "authorized", "captured", "failed"])
    .default("pending"),
  delivered_at: model.dateTime().nullable(),
  cancelled_at: model.dateTime().nullable(),
  cancelled_by: model.text().nullable(),
  cancellation_reason: model.text().nullable(),
  version: model.number().default(0),
  metadata: model.json().nullable(),
  // These same-module relations make message/history ownership explicit in
  // the module graph. The service still deletes the dependants first so the
  // API remains safe on installations that have not run the FK migration yet.
  messages: model.hasMany(() => CustomOrderMessage, {
    mappedBy: "custom_order",
  }),
  status_histories: model.hasMany(() => CustomOrderStatusHistory, {
    mappedBy: "custom_order",
  }),
})

export const CustomOrderMessage = model.define("custom_order_message", {
  id: model.id({ prefix: "com" }).primaryKey(),
  custom_order: model.belongsTo(() => CustomOrderRequest, {
    mappedBy: "messages",
  }),
  sender_type: model.enum(["customer", "artisan", "admin"]),
  sender_id: model.text().nullable(),
  message: model.text(),
  attachments: model.json().nullable(),
})

export const CustomOrderStatusHistory = model.define(
  "custom_order_status_history",
  {
    id: model.id({ prefix: "csh" }).primaryKey(),
    custom_order: model.belongsTo(() => CustomOrderRequest, {
      mappedBy: "status_histories",
    }),
    from_status: model
      .enum(["request", "quote", "confirmed", "produced", "delivered", "cancelled"])
      .nullable(),
    to_status: model.enum([
      "request",
      "quote",
      "confirmed",
      "produced",
      "delivered",
      "cancelled",
    ]),
    actor_type: model.enum(["customer", "artisan", "admin", "system"]),
    actor_id: model.text().nullable(),
    reason: model.text().nullable(),
  }
)
