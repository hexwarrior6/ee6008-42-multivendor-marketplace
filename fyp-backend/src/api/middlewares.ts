import { defineMiddlewares, authenticate } from "@medusajs/framework/http"
import { protectCustomPaymentCollection } from "./utils/custom-order-payments"
import { protectCustomRefund } from "./utils/custom-order-refunds"

/**
 * The media upload route accepts base64 JSON.  A 10 MB decoded file expands
 * to roughly 13.4 MB in base64, so leave a little room for the JSON envelope
 * while keeping the limit scoped to this route only.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/payments/:id/refund",
      methods: ["POST"],
      middlewares: [
        authenticate("user", ["session", "bearer", "api-key"]),
        protectCustomRefund,
      ],
    },
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      methods: ["POST"],
      middlewares: [protectCustomPaymentCollection],
    },
    {
      matcher: "/store/recommendations",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      matcher: "/store/custom-orders",
      methods: ["GET", "POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // Keep a wildcard matcher so every current and future nested custom
      // order endpoint (messages, history, media, etc.) is protected too.
      matcher: "/store/custom-orders/*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/admin/artisan-profiles/:id/media/upload",
      methods: ["POST"],
      bodyParser: { sizeLimit: "15mb" },
    },
  ],
})
