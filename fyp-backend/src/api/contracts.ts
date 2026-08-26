export type { CustomOrderStatus } from "../modules/custom-order/state-machine"
import type { CustomOrderStatus } from "../modules/custom-order/state-machine"

export type CustomOrderRequestBody = {
  artisan_id: string
  /** Ignored by the API; customer_id is always read from auth_context. */
  customer_id?: string | null
  title: string
  product_category?: string
  product_category_id?: string | null
  product_id?: string | null
  listing_type?: "custom_request" | "product"
  description: string
  budget_amount?: number | null
  currency_code?: string
  metadata?: Record<string, unknown> | null
}

export type CustomOrderMessageBody = {
  /** These are retained for backwards-compatible TypeScript clients only. */
  sender_type?: "customer" | "artisan" | "admin"
  sender_id?: string | null
  message: string
  attachments?: Array<{
    type: "image" | "file"
    url: string
    size?: number
    mime_type?: string
    name?: string
  }> | null
}

export type RecommendationItem = {
  product_id: string
  title: string
  handle?: string | null
  thumbnail?: string | null
  score: number
  reason?: string
}

export type SalesAnalyticsResponse = {
  period: { from: string; to: string }
  currency_code: string
  summary: {
    revenue: number
    orders: number
    average_order_value: number
  }
  top_products: Array<{
    product_id: string
    title: string
    units: number
    revenue: number
  }>
  daily: Array<{ date: string; orders: number; revenue: number }>
}
