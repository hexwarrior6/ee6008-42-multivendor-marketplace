import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowPath,
  ChartBar,
  InformationCircle,
  Spinner,
} from "@medusajs/icons"
import { Badge, Button, Heading, Input } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import {
  buildTimeline,
  currencies,
  formatAmount,
  loadAnalytics,
  presetRange,
  statuses,
  validateFilters,
  type Analytics,
  type ErrorKind,
  type Filters,
  type Locale,
} from "../../components/analytics/data"
import { copy, type Labels } from "../../components/analytics/copy"
import { Trend } from "../../components/analytics/trend"

function Problem({
  kind,
  t,
  retry,
}: {
  kind: ErrorKind
  t: Labels
  retry: () => void
}) {
  return (
    <div
      role="alert"
      className="my-4 flex flex-wrap items-center justify-between gap-3 rounded border border-ui-border-error bg-ui-bg-error p-4 text-sm"
    >
      <span>{t[kind]}</span>
      {kind === "session" ? (
        <a className="underline" href="/app/login">
          {t.login}
        </a>
      ) : (
        kind !== "forbidden" && (
          <Button size="small" variant="secondary" onClick={retry}>
            {t.retry}
          </Button>
        )
      )}
    </div>
  )
}
function Metrics({
  items,
}: {
  items: Array<{ label: string; value: string }>
}) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-lg border border-ui-border-base bg-ui-bg-base p-4"
        >
          <dt className="text-sm text-ui-fg-subtle">{item.label}</dt>
          <dd className="mt-2 break-words text-2xl font-medium tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function AnalyticsPage() {
  const [locale, setLocale] = useState<Locale>("zh-CN")
  const t = copy[locale]
  const [filters, setFilters] = useState<Filters>(() => ({
    ...presetRange(30),
    currency_code: "cny",
  }))
  const [draft, setDraft] = useState(filters)
  const [validation, setValidation] =
    useState<ReturnType<typeof validateFilters>>(null)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const retry = () => setReload((count) => count + 1)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    setData(null)
    void loadAnalytics(filters, controller.signal)
      .then((result) => {
        if (active) setData(result)
      })
      .catch(() => {
        if (active)
          setData({
            sales: { error: "unavailable" },
            custom: { error: "unavailable" },
          })
      })
      .finally(() => {
        clearTimeout(timeout)
        if (active) setLoading(false)
      })
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [filters, reload])

  const sales = data?.sales.data
  const custom = data?.custom.data
  const sessionExpired =
    data?.sales.error === "session" || data?.custom.error === "session"
  const timeline = useMemo(
    () => buildTimeline(filters, sales?.daily, custom?.daily),
    [filters, sales, custom]
  )
  const money = (value: number) =>
    formatAmount(value, filters.currency_code, locale)
  const number = (value: number) => value.toLocaleString(locale)
  const apply = (next: Filters) => {
    const error = validateFilters(next)
    setValidation(error)
    if (!error) {
      setData(null)
      setLoading(true)
      setFilters({ ...next })
    }
  }

  return (
    <div
      className="mx-auto w-full max-w-screen-xl space-y-6 p-4 sm:p-6"
      lang={locale}
      data-testid="seller-analytics"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading level="h1" className="text-2xl">
            {t.title}
          </Heading>
          <p className="mt-1 text-sm text-ui-fg-subtle">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1" role="group" aria-label={t.language}>
            <Button
              size="small"
              variant={locale === "zh-CN" ? "secondary" : "transparent"}
              aria-pressed={locale === "zh-CN"}
              onClick={() => setLocale("zh-CN")}
            >
              中文
            </Button>
            <Button
              size="small"
              variant={locale === "en" ? "secondary" : "transparent"}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              EN
            </Button>
          </div>
          <Button
            size="small"
            variant="secondary"
            disabled={loading}
            onClick={retry}
            aria-label={t.refresh}
            title={t.refresh}
          >
            <ArrowPath aria-hidden="true" />
          </Button>
        </div>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 border-y border-ui-border-base py-4"
        onSubmit={(event) => {
          event.preventDefault()
          apply(draft)
        }}
      >
        <label className="min-w-0 flex-1 basis-36 text-sm">
          <span className="mb-1 block">{t.from}</span>
          <Input
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
            required
          />
        </label>
        <label className="min-w-0 flex-1 basis-36 text-sm">
          <span className="mb-1 block">{t.to}</span>
          <Input
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">{t.currency}</span>
          <select
            aria-label={t.currency}
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
            value={draft.currency_code}
            onChange={(event) =>
              setDraft({ ...draft, currency_code: event.target.value })
            }
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" size="small">
          {t.apply}
        </Button>
        <div className="flex gap-1" role="group" aria-label={t.period}>
          {[7, 30, 90].map((days) => (
            <Button
              type="button"
              size="small"
              variant="transparent"
              key={days}
              onClick={() => {
                const next = {
                  ...presetRange(days),
                  currency_code: draft.currency_code,
                }
                setDraft(next)
                apply(next)
              }}
            >
              {days} {t.days}
            </Button>
          ))}
        </div>
        {validation && (
          <p role="alert" className="w-full text-sm text-ui-fg-error">
            {validation === "currency" ? t.invalidCurrency : t[validation]}
          </p>
        )}
      </form>
      <p className="text-xs text-ui-fg-subtle">
        {t.period}: {filters.from} – {filters.to} ·{" "}
        {filters.currency_code.toUpperCase()}
      </p>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-64 items-center justify-center gap-2 text-sm text-ui-fg-subtle"
        >
          <Spinner className="animate-spin" />
          {t.loading}
        </div>
      ) : sessionExpired ? (
        <Problem kind="session" t={t} retry={retry} />
      ) : (
        <>
          {data?.sales.error ? (
            <Problem kind={data.sales.error} t={t} retry={retry} />
          ) : (
            sales && (
              <section aria-label={t.revenue}>
                {sales.truncated && (
                  <div
                    role="status"
                    className="mb-4 rounded border border-ui-border-base bg-ui-bg-subtle p-3 text-sm"
                  >
                    <Badge color="orange">{t.partial}</Badge>
                    <p className="mt-2">{t.truncated}</p>
                  </div>
                )}
                <Metrics
                  items={[
                    { label: t.revenue, value: money(sales.summary.revenue) },
                    { label: t.orders, value: number(sales.summary.orders) },
                    {
                      label: t.average,
                      value: money(sales.summary.average_order_value),
                    },
                  ]}
                />
                <p className="mt-3 text-xs leading-5 text-ui-fg-subtle">
                  {t.basis}
                </p>
                <div className="grid gap-x-8 border-b border-ui-border-base lg:grid-cols-2">
                  <Trend
                    days={timeline}
                    metric="revenue"
                    currency={filters.currency_code}
                    locale={locale}
                    t={t}
                  />
                  <Trend
                    days={timeline}
                    metric="orders"
                    currency={filters.currency_code}
                    locale={locale}
                    t={t}
                  />
                </div>
                <div className="py-6">
                  <h2 className="text-base font-medium">{t.products}</h2>
                  <p className="mt-1 text-xs text-ui-fg-subtle">
                    {t.productBasis}
                  </p>
                  {sales.top_products.length ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead className="border-b border-ui-border-base text-ui-fg-subtle">
                          <tr>
                            <th className="p-3 text-left font-medium">
                              {t.rank}
                            </th>
                            <th className="p-3 text-left font-medium">
                              {t.product}
                            </th>
                            <th className="p-3 text-right font-medium">
                              {t.units}
                            </th>
                            <th className="p-3 text-right font-medium">
                              {t.revenue}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.top_products.map((product, index) => (
                            <tr
                              key={product.product_id}
                              className="border-b border-ui-border-base"
                            >
                              <td className="p-3 text-ui-fg-subtle">
                                {index + 1}
                              </td>
                              <td className="max-w-xs break-words p-3">
                                {product.product_id === "unknown" ? (
                                  product.title
                                ) : (
                                  <a
                                    className="text-ui-fg-interactive hover:underline"
                                    href={`/app/products/${encodeURIComponent(
                                      product.product_id
                                    )}`}
                                  >
                                    {product.title || product.product_id}
                                  </a>
                                )}
                              </td>
                              <td className="p-3 text-right tabular-nums">
                                {number(product.units)}
                              </td>
                              <td className="whitespace-nowrap p-3 text-right tabular-nums">
                                {money(product.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="py-10 text-center text-sm text-ui-fg-subtle">
                      {t.emptyProducts}
                    </p>
                  )}
                </div>
              </section>
            )
          )}

          <section
            className="border-t border-ui-border-base pt-6"
            aria-label={t.requestsTitle}
          >
            <h2 className="text-base font-medium">{t.requestsTitle}</h2>
            <p className="mt-1 text-xs leading-5 text-ui-fg-subtle">
              {t.requestsBasis}
            </p>
            {data?.custom.error ? (
              <Problem kind={data.custom.error} t={t} retry={retry} />
            ) : (
              custom && (
                <>
                  {custom.truncated && (
                    <p role="status" className="mt-4 text-sm text-ui-fg-error">
                      {t.truncated}
                    </p>
                  )}
                  <dl className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: t.requests, value: custom.summary.requests },
                      { label: t.open, value: custom.summary.open_requests },
                      {
                        label: t.delivered,
                        value: custom.summary.delivered_requests,
                      },
                      {
                        label: t.cancelled,
                        value: custom.summary.cancelled_requests,
                      },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt className="text-sm text-ui-fg-subtle">
                          {item.label}
                        </dt>
                        <dd className="mt-1 text-xl font-medium tabular-nums">
                          {number(item.value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {statuses.map((status) => (
                      <div
                        key={status}
                        className="flex min-w-0 justify-between gap-2 border-b border-ui-border-base py-2 text-sm"
                      >
                        <dt>{t.statuses[status]}</dt>
                        <dd className="tabular-nums">
                          {number(custom.status_counts[status])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )
            )}
          </section>
        </>
      )}
      <section
        className="border-t border-ui-border-base pt-6"
        aria-label={t.sentiment}
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-medium">{t.sentiment}</h2>
          <Badge color="grey">{t.pending}</Badge>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-ui-fg-subtle">
          <InformationCircle aria-hidden="true" />
          {t.sentimentBody}
        </p>
        <p className="mt-1 text-xs text-ui-fg-muted">{t.sentimentOwner}</p>
      </section>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "menu",
  translationNs: "sellerAnalytics",
  icon: ChartBar,
})
