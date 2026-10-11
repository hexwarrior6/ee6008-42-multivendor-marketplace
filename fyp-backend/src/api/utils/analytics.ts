import { MedusaError } from "@medusajs/framework/utils"

const DAY_MS = 24 * 60 * 60 * 1000
const invalid = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, message)

function parseDate(value: unknown, fallback: Date, field: "from" | "to") {
  if (value === undefined || value === "") return fallback
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(
      value
    )
  ) {
    throw invalid(`${field} must be an ISO date or timestamp with timezone`)
  }
  const calendar = value.slice(0, 10)
  const day = new Date(`${calendar}T00:00:00.000Z`)
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== calendar
  ) {
    throw invalid(`${field} must be a valid calendar date`)
  }
  const result =
    value.length === 10
      ? new Date(day.getTime() + (field === "to" ? DAY_MS - 1 : 0))
      : new Date(value)
  if (!Number.isFinite(result.getTime()))
    throw invalid(`${field} must be a valid ISO date`)
  return result
}

/** Date-only filters cover the entire UTC day, not only its midnight. */
export function parseAnalyticsPeriod(
  query: { from?: unknown; to?: unknown },
  now = new Date()
) {
  const from = parseDate(
    query.from,
    new Date(now.getTime() - 30 * DAY_MS),
    "from"
  )
  const to = parseDate(query.to, now, "to")
  if (from > to) throw invalid("from must be earlier than or equal to to")
  if (to.getTime() - from.getTime() > 366 * DAY_MS)
    throw invalid("Analytics date range cannot exceed 366 days")
  return { from, to }
}

export function parseAnalyticsStoreId(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw invalid("Invalid store_id")
  return value
}
