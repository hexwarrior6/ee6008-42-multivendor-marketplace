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
  /** True when the hard safety cap prevented a complete result set. */
  truncated: boolean
}

export type SentimentSummary = {
  total: number
  positive: number
  neutral: number
  negative: number
  positive_ratio: number
  negative_ratio: number
  average_score: number
  average_rating: number
  top_positive_terms: Array<[string, number]>
  top_negative_terms: Array<[string, number]>
}

export type SentimentAnalyticsResponse = {
  summary: SentimentSummary | null
  dimension: "store" | "overall" | "unavailable"
  context: { store_id?: string }
  model_version: string | null
  generated_at: string | null
  source: string
}

/** Snapshot counts, not payment-ledger revenue. Daily groups use creation date. */
export type CustomOrderAnalyticsResponse = {
  period: { from: string; to: string }
  currency_code: string
  summary: { requests: number; open_requests: number; delivered_requests: number; cancelled_requests: number }
  status_counts: Record<CustomOrderStatus, number>
  payment_status_counts: Record<"pending" | "authorized" | "captured" | "failed", number>
  daily: Array<{ date: string; requests: number }>
  truncated: boolean
}
