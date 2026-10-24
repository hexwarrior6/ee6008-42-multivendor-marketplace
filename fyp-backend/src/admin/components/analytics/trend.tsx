import { useState } from "react"
import { Button } from "@medusajs/ui"
import { bucketTimeline, formatAmount, type Day, type Locale } from "./data"
import type { Labels } from "./copy"

export function Trend({
  days,
  metric,
  currency,
  locale,
  t,
}: {
  days: Day[]
  metric: "revenue" | "orders"
  currency: string
  locale: Locale
  t: Labels
}) {
  const [detail, setDetail] = useState(false)
  const title = metric === "revenue" ? t.revenueTrend : t.ordersTrend
  const value = (amount: number) =>
    metric === "revenue"
      ? formatAmount(amount, currency, locale)
      : amount.toLocaleString(locale)
  const buckets = bucketTimeline(days)
  const max = Math.max(1, ...buckets.map((day) => day[metric]))
  const hasData = buckets.some((day) => day[metric] > 0)
  return (
    <section className="min-w-0 py-6" aria-label={title}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">{title}</h2>
        <div className="flex gap-1" role="group" aria-label={title}>
          <Button
            size="small"
            variant={!detail ? "secondary" : "transparent"}
            aria-pressed={!detail}
            onClick={() => setDetail(false)}
          >
            {t.chart}
          </Button>
          <Button
            size="small"
            variant={detail ? "secondary" : "transparent"}
            aria-pressed={detail}
            onClick={() => setDetail(true)}
          >
            {t.details}
          </Button>
        </div>
      </div>
      {detail ? (
        <div className="max-h-64 overflow-auto rounded border border-ui-border-base">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ui-bg-subtle">
              <tr>
                <th className="p-3 text-left font-medium">{t.date}</th>
                <th className="p-3 text-right font-medium">
                  {metric === "revenue" ? t.revenue : t.orders}
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className="border-t border-ui-border-base">
                  <td className="p-3 whitespace-nowrap">{day.date}</td>
                  <td className="p-3 text-right tabular-nums">
                    {value(day[metric])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mb-3 flex justify-between text-xs text-ui-fg-subtle">
            <span>{value(max === 1 && !hasData ? 0 : max)}</span>
            <span>UTC</span>
          </div>
          <ul
            className="grid h-40 items-end gap-1 border-b border-ui-border-base"
            style={{
              gridTemplateColumns: `repeat(${Math.max(
                1,
                buckets.length
              )}, minmax(0, 1fr))`,
            }}
            aria-label={title}
          >
            {buckets.map((day) => {
              const label = `${day.from}${
                day.to !== day.from ? ` - ${day.to}` : ""
              }: ${value(day[metric])}`
              return (
                <li
                  key={day.from}
                  className="flex h-full min-w-0 items-end"
                  aria-label={label}
                  title={label}
                >
                  <span
                    className={`block w-full rounded-t-sm ${
                      metric === "revenue" ? "bg-emerald-500" : "bg-sky-500"
                    }`}
                    style={{
                      height: `${
                        day[metric] ? Math.max(1, (day[metric] / max) * 100) : 0
                      }%`,
                    }}
                  />
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex justify-between text-xs text-ui-fg-subtle">
            <span>{days[0]?.date}</span>
            <span>{days[days.length - 1]?.date}</span>
          </div>
          {!hasData && (
            <p className="mt-3 text-center text-sm text-ui-fg-subtle">
              {t.empty}
            </p>
          )}
        </>
      )}
    </section>
  )
}
