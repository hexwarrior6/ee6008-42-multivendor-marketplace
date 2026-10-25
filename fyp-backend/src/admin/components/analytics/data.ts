import type {
  CustomOrderAnalyticsResponse,
  SalesAnalyticsResponse,
  SentimentAnalyticsResponse,
} from "../../../api/contracts"

export type Filters = { from: string; to: string; currency_code: string }
export type Locale = "zh-CN" | "en"
export type ErrorKind = "session" | "forbidden" | "unavailable" | "invalid"
export type Part<T> =
  | { data: T; error?: never }
  | { error: ErrorKind; data?: never }
export type Analytics = {
  sales: Part<SalesAnalyticsResponse>
  custom: Part<CustomOrderAnalyticsResponse>
}
export type Day = {
  date: string
  revenue: number
  orders: number
  requests: number
}
export const currencies = ["cny", "usd", "sgd", "eur"] as const
export const statuses = [
  "request",
  "quote",
  "confirmed",
  "produced",
  "delivered",
  "cancelled",
] as const
const DAY = 86400000
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
const amount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
const count = (value: unknown) => amount(value) && Number.isInteger(value)
const date = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

export function presetRange(days: number, now = new Date()) {
  const to = now.toISOString().slice(0, 10)
  return {
    from: new Date(Date.parse(to) - (days - 1) * DAY)
      .toISOString()
      .slice(0, 10),
    to,
  }
}

export function validateFilters(
  filters: Filters
): "dates" | "range" | "currency" | null {
  if (!date(filters.from) || !date(filters.to) || filters.from > filters.to)
    return "dates"
  if ((Date.parse(filters.to) - Date.parse(filters.from)) / DAY >= 366)
    return "range"
  if (!currencies.some((code) => code === filters.currency_code))
    return "currency"
  return null
}

export function formatAmount(value: number, currency: string, locale: Locale) {
  // Medusa v2 amounts are already in major currency units.
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value)
}

function baseResponse(
  value: unknown,
  filters: Filters
): value is Record<string, unknown> {
  return (
    object(value) &&
    value.currency_code === filters.currency_code &&
    object(value.period) &&
    typeof value.period.from === "string" &&
    typeof value.period.to === "string" &&
    value.period.from.slice(0, 10) === filters.from &&
    value.period.to.slice(0, 10) === filters.to &&
    typeof value.truncated === "boolean" &&
    object(value.summary) &&
    Array.isArray(value.daily)
  )
}
const inPeriod = (value: unknown, filters: Filters) =>
  date(value) && value >= filters.from && value <= filters.to

function validSales(
  value: unknown,
  filters: Filters
): value is SalesAnalyticsResponse {
  if (
    !baseResponse(value, filters) ||
    !object(value.summary) ||
    !Array.isArray(value.daily) ||
    !Array.isArray(value.top_products)
  )
    return false
  return (
    amount(value.summary.revenue) &&
    count(value.summary.orders) &&
    amount(value.summary.average_order_value) &&
    value.daily.every(
      (row) =>
        object(row) &&
        inPeriod(row.date, filters) &&
        amount(row.revenue) &&
        count(row.orders)
    ) &&
    value.top_products.every(
      (row) =>
        object(row) &&
        typeof row.product_id === "string" &&
        typeof row.title === "string" &&
        amount(row.units) &&
        amount(row.revenue)
    )
  )
}
function validCustom(
  value: unknown,
  filters: Filters
): value is CustomOrderAnalyticsResponse {
  if (
    !baseResponse(value, filters) ||
    !object(value.summary) ||
    !object(value.status_counts) ||
    !object(value.payment_status_counts) ||
    !Array.isArray(value.daily)
  )
    return false
  const business = value.status_counts
  const payments = value.payment_status_counts
  return (
    [
      "requests",
      "open_requests",
      "delivered_requests",
      "cancelled_requests",
    ].every((key) => count((value.summary as Record<string, unknown>)[key])) &&
    statuses.every((key) => count(business[key])) &&
    ["pending", "authorized", "captured", "failed"].every((key) =>
      count(payments[key])
    ) &&
    value.daily.every(
      (row) => object(row) && inPeriod(row.date, filters) && count(row.requests)
    )
  )
}

async function getPart<T>(
  endpoint: string,
  filters: Filters,
  signal: AbortSignal,
  valid: (value: unknown, filters: Filters) => value is T
): Promise<Part<T>> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  const timeout = setTimeout(abort, 10000)
  try {
    const query = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      currency_code: filters.currency_code,
    })
    const response = await fetch(`/admin/analytics/${endpoint}?${query}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    if (!response.ok)
      return {
        error:
          response.status === 401
            ? "session"
            : response.status === 403
            ? "forbidden"
            : "unavailable",
      }
    const data: unknown = await response.json()
    return valid(data, filters) ? { data } : { error: "invalid" }
  } catch (error) {
    if (signal.aborted) throw error
    return { error: "unavailable" }
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", abort)
  }
}

export async function loadAnalytics(
  filters: Filters,
  signal: AbortSignal
): Promise<Analytics> {
  if (validateFilters(filters))
    return { sales: { error: "invalid" }, custom: { error: "invalid" } }
  const [sales, custom] = await Promise.all([
    getPart("sales", filters, signal, validSales),
    getPart("custom-orders", filters, signal, validCustom),
  ])
  return { sales, custom }
}

const validSentiment = (
  value: unknown
): value is SentimentAnalyticsResponse =>
  object(value) &&
  (value.summary === null || object(value.summary)) &&
  ["store", "overall", "unavailable"].includes(String(value.dimension)) &&
  object(value.context) &&
  typeof value.source === "string"

/**
 * Load the seller sentiment summary. The endpoint needs no date filters and
 * degrades server-side, so any failure simply keeps the card in its
 * pending state instead of surfacing an error panel.
 */
export async function loadSentiment(
  signal: AbortSignal
): Promise<SentimentAnalyticsResponse | null> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  const timeout = setTimeout(abort, 10000)
  try {
    const response = await fetch("/admin/analytics/sentiment", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return null
    const data: unknown = await response.json()
    return validSentiment(data) ? data : null
  } catch (error) {
    if (signal.aborted) throw error
    return null
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", abort)
  }
}

export function buildTimeline(
  filters: Filters,
  sales: SalesAnalyticsResponse["daily"] = [],
  custom: CustomOrderAnalyticsResponse["daily"] = []
): Day[] {
  const paid = new Map(sales.map((row) => [row.date, row]))
  const requested = new Map(custom.map((row) => [row.date, row.requests]))
  const days: Day[] = []
  if (validateFilters(filters)) return days
  for (
    let time = Date.parse(filters.from);
    time <= Date.parse(filters.to);
    time += DAY
  ) {
    const date = new Date(time).toISOString().slice(0, 10)
    days.push({
      date,
      revenue: paid.get(date)?.revenue ?? 0,
      orders: paid.get(date)?.orders ?? 0,
      requests: requested.get(date) ?? 0,
    })
  }
  return days
}

export function bucketTimeline(days: Day[]) {
  const size = Math.max(1, Math.ceil(days.length / 30))
  const buckets: Array<{
    from: string
    to: string
    revenue: number
    orders: number
    requests: number
  }> = []
  for (let index = 0; index < days.length; index += size) {
    const group = days.slice(index, index + size)
    buckets.push({
      from: group[0].date,
      to: group[group.length - 1].date,
      revenue: group.reduce((sum, day) => sum + day.revenue, 0),
      orders: group.reduce((sum, day) => sum + day.orders, 0),
      requests: group.reduce((sum, day) => sum + day.requests, 0),
    })
  }
  return buckets
}
