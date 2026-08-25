import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { SalesAnalyticsResponse } from "../../../contracts"

const isoDate = (value: unknown, fallback: Date) => {
  const date = value ? new Date(String(value)) : fallback
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString()
}

/**
 * Admin analytics contract. The zero-valued baseline lets S2 build charts
 * immediately; aggregation over orders and reviews can be added without
 * changing the response shape.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  const { from, to, currency_code = "cny" } = req.query
  const response: SalesAnalyticsResponse = {
    period: {
      from: isoDate(from, defaultFrom),
      to: isoDate(to, now),
    },
    currency_code: String(currency_code),
    summary: {
      revenue: 0,
      orders: 0,
      average_order_value: 0,
    },
    top_products: [],
    daily: [],
  }

  res.json(response)
}
