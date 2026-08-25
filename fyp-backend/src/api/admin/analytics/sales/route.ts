import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { SalesAnalyticsResponse } from "../../../contracts"

type OrderItem = {
  product_id?: string | null
  title?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  total?: number | string | null
  product?: { id?: string; title?: string | null } | null
}

type OrderRecord = {
  id: string
  currency_code?: string | null
  total?: number | string | null
  created_at?: string | Date | null
  items?: OrderItem[] | null
}

const parseDate = (value: unknown, fallback: Date) => {
  const date = value ? new Date(String(value)) : fallback
  return Number.isNaN(date.getTime()) ? fallback : date
}

/**
 * Aggregate the order module into the stable seller analytics response. The
 * query is deliberately kept in this route so S2 can consume it without
 * knowing the underlying Medusa order schema.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  const { from, to, currency_code = "cny" } = req.query
  const fromDate = parseDate(from, defaultFrom)
  const toDate = parseDate(to, now)

  if (fromDate > toDate) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "from must be earlier than or equal to to"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "currency_code",
      "total",
      "created_at",
      "items.*",
      "items.product.id",
      "items.product.title",
    ],
    filters: {
      created_at: {
        $gte: fromDate.toISOString(),
        $lte: toDate.toISOString(),
      },
      currency_code: String(currency_code),
    },
    pagination: { take: 1000 },
  })

  const orders = (data || []) as OrderRecord[]
  const daily = new Map<string, { date: string; orders: number; revenue: number }>()
  const products = new Map<
    string,
    { product_id: string; title: string; units: number; revenue: number }
  >()
  let revenue = 0

  for (const order of orders) {
    const orderRevenue = Number(order.total || 0)
    revenue += Number.isFinite(orderRevenue) ? orderRevenue : 0

    const date = new Date(String(order.created_at || now))
    const dateKey = Number.isNaN(date.getTime())
      ? toDate.toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10)
    const day = daily.get(dateKey) || { date: dateKey, orders: 0, revenue: 0 }
    day.orders += 1
    day.revenue += orderRevenue
    daily.set(dateKey, day)

    for (const item of order.items || []) {
      const productId = String(item.product_id || item.product?.id || "unknown")
      const units = Number(item.quantity || 0)
      const lineRevenue = Number(
        item.total ?? Number(item.unit_price || 0) * units
      )
      const current = products.get(productId) || {
        product_id: productId,
        title: String(item.product?.title || item.title || productId),
        units: 0,
        revenue: 0,
      }
      current.units += Number.isFinite(units) ? units : 0
      current.revenue += Number.isFinite(lineRevenue) ? lineRevenue : 0
      products.set(productId, current)
    }
  }

  const orderCount = orders.length
  const response: SalesAnalyticsResponse = {
    period: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    currency_code: String(currency_code),
    summary: {
      revenue,
      orders: orderCount,
      average_order_value: orderCount ? revenue / orderCount : 0,
    },
    top_products: [...products.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }

  res.json(response)
}
