export type CustomOrderStatus =
  | "request"
  | "quote"
  | "confirmed"
  | "produced"
  | "delivered"
  | "cancelled"

export type CustomOrderRequestBody = {
  artisan_id: string
  customer_id?: string | null
  title: string
  description: string
  budget_amount?: number | null
  currency_code?: string
  metadata?: Record<string, unknown> | null
}

export type CustomOrderMessageBody = {
  sender_type: "customer" | "artisan" | "admin"
  sender_id?: string | null
  message: string
  attachments?: Array<{ type: "image" | "file"; url: string }> | null
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
