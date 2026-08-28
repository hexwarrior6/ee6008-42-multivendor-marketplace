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
  id?: string | null
  product_id?: string | null
  variant_id?: string | null
  store_id?: string | null
  title?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  subtotal?: number | string | null
  total?: number | string | null
  product?: { id?: string; title?: string | null } | null
  variant?: {
    product_id?: string | null
    product?: { id?: string; title?: string | null } | null
  } | null
}

type PaymentRefund = { id?: string | null; amount?: number | string | null }
type PaymentCapture = { amount?: number | string | null }
type PaymentRecord = {
  amount?: number | string | null
  captured_at?: string | Date | null
  captures?: PaymentCapture[] | null
  refunds?: PaymentRefund[] | null
}
type PaymentCollection = {
  status?: string | null
  amount?: number | string | null
  captured_amount?: number | string | null
  refunded_amount?: number | string | null
  payments?: PaymentRecord[] | null
}

type OrderRecord = {
  id: string
  currency_code?: string | null
  total?: number | string | null
  status?: string | null
  canceled_at?: string | Date | null
  payment_status?: string | null
  refunded_amount?: number | string | null
  created_at?: string | Date | null
  items?: OrderItem[] | null
  stores?: Array<{ id?: string | null } | null> | null
  store?: { id?: string | null } | null
  store_id?: string | null
  payment_collections?: PaymentCollection[] | null
}

type ProductStoreMap = Map<string, Set<string>>

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
  truncated: false,
})

const asFiniteAmount = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : undefined
}

const capturedCollectionStatuses = new Set([
  "captured",
  "partially_captured",
  "partially_refunded",
  "refunded",
  "paid",
  "completed",
  "succeeded",
])

/** Return paid revenue after refunds, in the order currency's minor unit. */
export const getOrderNetRevenue = (order: OrderRecord): number => {
  const orderStatus = String(order.status || "").trim().toLowerCase()
  if (
    order.canceled_at ||
    ["canceled", "cancelled", "failed", "draft", "pending", "requires_action"].includes(
      orderStatus
    )
  ) {
    return 0
  }

  const collections = Array.isArray(order.payment_collections)
    ? order.payment_collections
    : []
  let captured = 0
  let refunded = 0
  let hasCapturedSignal = false

  for (const collection of collections) {
    const collectionCaptured = asFiniteAmount(collection.captured_amount)
    if (collectionCaptured !== undefined) {
      captured += Math.max(0, collectionCaptured)
      hasCapturedSignal = true
    } else {
      const collectionStatus = String(collection.status || "").toLowerCase()
      const paymentCapturedFromRecords = (collection.payments || []).reduce(
        (sum, payment) => {
          const captures = (payment.captures || [])
            .map((capture) => asFiniteAmount(capture.amount))
            .filter((amount): amount is number => amount !== undefined)
          if (captures.length) {
            return sum + captures.reduce(
              (total, amount) => total + Math.max(0, amount),
              0
            )
          }
          // A payment with captured_at is captured even on installations that
          // do not expose the nested capture rows through Remote Query.
          if (payment.captured_at) {
            return sum + Math.max(0, asFiniteAmount(payment.amount) || 0)
          }
          return sum
        },
        0
      )
      if (paymentCapturedFromRecords > 0) {
        captured += paymentCapturedFromRecords
        hasCapturedSignal = true
      } else if (capturedCollectionStatuses.has(collectionStatus)) {
        const collectionAmount = asFiniteAmount(collection.amount)
        if (collectionAmount !== undefined) {
          captured += Math.max(0, collectionAmount)
          hasCapturedSignal = true
        }
      }
    }

    const collectionRefunded = asFiniteAmount(collection.refunded_amount)
    if (collectionRefunded !== undefined) {
      refunded += Math.max(0, collectionRefunded)
    }
    if (collectionRefunded === undefined) {
      const paymentRefunds = (collection.payments || []).flatMap(
        (payment) => payment.refunds || []
      )
      if (paymentRefunds.length) {
        refunded += paymentRefunds.reduce(
          (sum, refund) => sum + Math.max(0, asFiniteAmount(refund.amount) || 0),
          0
        )
      }
    }
  }

  // Some older integrations expose a direct payment_status but not the
  // payment_collection relation. Keep that path explicit and still require a
  // paid status; never fall back to order.total for unpaid/unknown orders.
  if (!collections.length) {
    const paymentStatus = String(order.payment_status || "").toLowerCase()
    const directPaidStatuses = new Set([
      "captured",
      "paid",
      "completed",
      "succeeded",
    ])
    if (directPaidStatuses.has(paymentStatus)) {
      captured = Math.max(0, asFiniteAmount(order.total) || 0)
      refunded = Math.max(
        0,
        asFiniteAmount(order.refunded_amount) || 0
      )
      hasCapturedSignal = true
    } else if (
      paymentStatus === "partially_refunded" ||
      paymentStatus === "refunded"
    ) {
      // A direct refunded status without the refund amount cannot be safely
      // treated as revenue. A collection response normally supplies both
      // captured_amount and refunded_amount; this branch is only for legacy
      // integrations that expose a flat payment_status.
      const refundAmount = asFiniteAmount(order.refunded_amount)
      if (refundAmount !== undefined) {
        captured = Math.max(0, asFiniteAmount(order.total) || 0)
        refunded = Math.max(0, refundAmount)
        hasCapturedSignal = true
      }
    }
  }

  if (!hasCapturedSignal) {
    return 0
  }
  return Math.max(0, captured - refunded)
}

const getItemProductId = (item: OrderItem) =>
  item.product_id || item.product?.id || item.variant?.product_id || item.variant?.product?.id

const getOrderStoreIds = (order: OrderRecord) => [
  ...new Set([
    ...(order.stores || [])
      .map((store) => store?.id)
      .filter((id): id is string => Boolean(id)),
    ...(order.store_id ? [order.store_id] : []),
    ...(order.store?.id ? [order.store.id] : []),
  ]),
]

const getItemGrossRevenue = (item: OrderItem) => {
  const total = asFiniteAmount(item.total ?? item.subtotal)
  if (total !== undefined) {
    return Math.max(0, total)
  }
  const unitPrice = asFiniteAmount(item.unit_price)
  const quantity = asFiniteAmount(item.quantity)
  if (unitPrice === undefined || quantity === undefined) {
    return 0
  }
  return Math.max(0, unitPrice * quantity)
}

const itemBelongsToStores = (
  order: OrderRecord,
  item: OrderItem,
  permittedStoreIds: Set<string>,
  productStores: ProductStoreMap
) => {
  if (item.store_id && permittedStoreIds.has(item.store_id)) {
    return true
  }
  const productId = getItemProductId(item)
  const linkedStores = productId ? productStores.get(productId) : undefined
  if (linkedStores && [...linkedStores].some((id) => permittedStoreIds.has(id))) {
    return true
  }
  // A legacy single-store order may not expose product_store links. It is
  // safe to use the order boundary only when there is exactly one store and
  // the line itself has no product identity to misattribute.
  return !productId && getOrderStoreIds(order).length === 1 &&
    permittedStoreIds.has(getOrderStoreIds(order)[0])
}

const loadProductStoreMap = async (
  query: { graph: (input: unknown) => Promise<{ data?: unknown[] }> },
  productIds: string[]
): Promise<ProductStoreMap> => {
  const result: ProductStoreMap = new Map()
  // Keep Remote Query variables reasonably small for large order histories.
  for (let index = 0; index < productIds.length; index += 500) {
    const chunk = productIds.slice(index, index + 500)
    const { data } = await query.graph({
      entity: "product_store",
      fields: ["product_id", "store_id", "store.id"],
      filters: { product_id: chunk },
    })
    for (const raw of data || []) {
      const link = raw as {
        product_id?: string | null
        store_id?: string | null
        store?: { id?: string | null } | null
      }
      if (!link.product_id) {
        continue
      }
      const storeId = link.store_id || link.store?.id
      if (!storeId) {
        continue
      }
      const stores = result.get(link.product_id) || new Set<string>()
      stores.add(storeId)
      result.set(link.product_id, stores)
    }
  }
  return result
}

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
  // protect the process, but fetch one probe page at the boundary so the
  // response can truthfully tell callers when data was truncated.
  let truncated = false
  while (true) {
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
        "status",
        "canceled_at",
        "payment_status",
        "refunded_amount",
        "created_at",
        "stores.id",
        "*items",
        "*items.variant.product",
        "*payment_collections",
        "*payment_collections.payments",
        "*payment_collections.payments.captures",
        "*payment_collections.payments.refunds",
      ],
      filters: orderFilters,
      pagination: { take: ORDER_PAGE_SIZE, skip },
    })

    const page = (data || []) as OrderRecord[]
    const remaining = MAX_ANALYTICS_ORDERS - allOrders.length
    if (remaining <= 0) {
      truncated = page.length > 0
      break
    }
    if (page.length > remaining) {
      allOrders.push(...page.slice(0, remaining))
      truncated = true
      break
    }
    allOrders.push(...page)
    if (page.length < ORDER_PAGE_SIZE) {
      break
    }
    skip += page.length
  }

  const scopedStoreIds = permittedStoreIds ? new Set(permittedStoreIds) : undefined
  let productStores: ProductStoreMap = new Map()
  if (scopedStoreIds) {
    const productIds = [
      ...new Set(
        allOrders
          .flatMap((order) => order.items || [])
          .map(getItemProductId)
          .filter((id): id is string => Boolean(id))
      ),
    ]
    try {
      productStores = await loadProductStoreMap(query, productIds)
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Product store ownership could not be verified for analytics"
      )
    }
  }

  const orders = scopedStoreIds
    ? allOrders.filter((order) => {
        const orderStores = getOrderStoreIds(order)
        // The line-item product_store check below remains authoritative when
        // a legacy order has no materialized order-store relation.
        return !orderStores.length ||
          orderStores.some((id) => scopedStoreIds.has(id))
      })
    : allOrders
  const daily = new Map<string, { date: string; orders: number; revenue: number }>()
  const products = new Map<
    string,
    { product_id: string; title: string; units: number; revenue: number }
  >()
  let revenue = 0
  let orderCount = 0

  for (const order of orders) {
    const netOrderRevenue = getOrderNetRevenue(order)
    if (netOrderRevenue <= 0) {
      continue
    }

    const allItems = order.items || []
    const scopedItems = scopedStoreIds
      ? allItems.filter((item) =>
          itemBelongsToStores(order, item, scopedStoreIds, productStores)
        )
      : allItems
    if (scopedStoreIds && !scopedItems.length) {
      continue
    }

    const grossOrderItems = allItems.reduce(
      (sum, item) => sum + getItemGrossRevenue(item),
      0
    )
    const grossScopedItems = scopedItems.reduce(
      (sum, item) => sum + getItemGrossRevenue(item),
      0
    )
    // Seller revenue is allocated from the paid, post-refund order amount by
    // each seller's line-item share. This prevents every seller on a
    // multi-vendor order from receiving the complete order.total.
    const scopedRevenue = scopedStoreIds
      ? grossOrderItems > 0
        ? netOrderRevenue * (grossScopedItems / grossOrderItems)
        : 0
      : netOrderRevenue
    if (scopedRevenue <= 0) {
      continue
    }
    revenue += scopedRevenue
    orderCount += 1

    const date = new Date(String(order.created_at || now))
    const dateKey = Number.isNaN(date.getTime())
      ? toDate.toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10)
    const day = daily.get(dateKey) || { date: dateKey, orders: 0, revenue: 0 }
    day.orders += 1
    day.revenue += scopedRevenue
    daily.set(dateKey, day)

    for (const item of scopedItems) {
      const productId = String(getItemProductId(item) || "unknown")
      const units = asFiniteAmount(item.quantity) || 0
      const itemGrossRevenue = getItemGrossRevenue(item)
      const lineRevenue = grossOrderItems > 0
        ? netOrderRevenue * (itemGrossRevenue / grossOrderItems)
        : 0
      const current = products.get(productId) || {
        product_id: productId,
        title: String(
          item.product?.title || item.variant?.product?.title || item.title || productId
        ),
        units: 0,
        revenue: 0,
      }
      current.units += units
      current.revenue += lineRevenue
      products.set(productId, current)
    }
  }

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
    truncated,
  }

  res.json(response)
}
