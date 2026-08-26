import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { SalesAnalyticsResponse } from "../../../contracts"
import {
  getBackofficeAccess,
  securityLog,
} from "../../../utils/authz"
import { parseCurrencyCode } from "../../../utils/validation"

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
  stores?: Array<{ id?: string | null } | null> | null
}

const ORDER_PAGE_SIZE = 1000
const MAX_ANALYTICS_ORDERS = 100_000
const MAX_ANALYTICS_RANGE_MS = 366 * 24 * 60 * 60 * 1000

const parseDate = (value: unknown, fallback: Date, field: string) => {
  if (value === undefined || value === null || value === "") {
    return fallback
  }
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${field} must be a valid ISO date`
    )
  }
  return date
}

const emptyResponse = (
  from: Date,
  to: Date,
  currencyCode: string
): SalesAnalyticsResponse => ({
  period: { from: from.toISOString(), to: to.toISOString() },
  currency_code: currencyCode,
  summary: { revenue: 0, orders: 0, average_order_value: 0 },
  top_products: [],
  daily: [],
})

/**
 * Aggregate order data into the stable seller analytics response. Store scope
 * always comes from the authenticated back-office user; a query-string
 * store_id can narrow an administrator's view but cannot broaden a seller's.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const access = await getBackofficeAccess(req)
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  const { from, to, store_id } = req.query
  const currencyCode = parseCurrencyCode(req.query.currency_code)
  const fromDate = parseDate(from, defaultFrom, "from")
  const toDate = parseDate(to, now, "to")

  if (fromDate > toDate) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "from must be earlier than or equal to to"
    )
  }
  if (toDate.getTime() - fromDate.getTime() > MAX_ANALYTICS_RANGE_MS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Analytics date range cannot exceed 366 days"
    )
  }

  const requestedStoreId = store_id ? String(store_id).trim() : undefined
  let permittedStoreIds: string[] | undefined
  if (access.isPlatformAdmin) {
    permittedStoreIds = requestedStoreId ? [requestedStoreId] : undefined
  } else {
    if (requestedStoreId && !access.storeIds.includes(requestedStoreId)) {
      securityLog(req, "seller attempted to query another store's analytics", {
        store_id: requestedStoreId,
        actor_id: access.context.actor_id,
      })
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You can only query analytics for your own store"
      )
    }
    permittedStoreIds = requestedStoreId
      ? [requestedStoreId]
      : access.storeIds
    if (!permittedStoreIds.length) {
      return res.json(emptyResponse(fromDate, toDate, currencyCode))
    }
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const allOrders: OrderRecord[] = []
  let skip = 0

  // Remote Query caps a single page at 1000 records. Keep the hard cap to
  // protect the process while still returning complete results under it.
  while (allOrders.length < MAX_ANALYTICS_ORDERS) {
    const orderFilters = {
      created_at: {
        $gte: fromDate.toISOString(),
        $lte: toDate.toISOString(),
      },
      currency_code: currencyCode,
      // Push the authenticated store boundary into Remote Query as well as
      // keeping the defensive in-memory check below. This prevents seller
      // analytics from loading unrelated stores into the Node process. The
      // generated Remote Query type intentionally excludes filters through a
      // list relation, although the runtime supports this nested filter.
      ...(permittedStoreIds?.length
        ? { stores: { id: permittedStoreIds } }
        : {}),
    } as never
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "currency_code",
        "total",
        "created_at",
        "stores.id",
        "items.*",
        "items.product.id",
        "items.product.title",
      ],
      filters: orderFilters,
      pagination: { take: ORDER_PAGE_SIZE, skip },
    })

    const page = (data || []) as OrderRecord[]
    allOrders.push(...page)
    if (page.length < ORDER_PAGE_SIZE) {
      break
    }
    skip += page.length
  }

  const orders = permittedStoreIds
    ? allOrders.filter((order) =>
        (order.stores || []).some(
          (store) => store?.id && permittedStoreIds!.includes(store.id)
        )
      )
    : allOrders
  const daily = new Map<string, { date: string; orders: number; revenue: number }>()
  const products = new Map<
    string,
    { product_id: string; title: string; units: number; revenue: number }
  >()
  let revenue = 0

  for (const order of orders) {
    const orderRevenue = Number(order.total || 0)
    const safeOrderRevenue = Number.isFinite(orderRevenue) ? orderRevenue : 0
    revenue += safeOrderRevenue

    const date = new Date(String(order.created_at || now))
    const dateKey = Number.isNaN(date.getTime())
      ? toDate.toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10)
    const day = daily.get(dateKey) || { date: dateKey, orders: 0, revenue: 0 }
    day.orders += 1
    day.revenue += safeOrderRevenue
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
    currency_code: currencyCode,
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
