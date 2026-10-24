import { InformationCircle } from "@medusajs/icons"
import { Badge } from "@medusajs/ui"
import type { Labels } from "./copy"
import type { Locale } from "./data"

export type SentimentSummaryData = {
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

const percent = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value)

function Terms({
  title,
  terms,
  empty,
  locale,
}: {
  title: string
  terms: Array<[string, number]>
  empty: string
  locale: Locale
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {terms.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {terms.map(([term, count]) => (
            <li key={term}>
              <Badge color="grey">
                {term} · {count.toLocaleString(locale)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ui-fg-subtle">{empty}</p>
      )}
    </div>
  )
}

export function SentimentSummary({
  summary,
  generatedAt,
  locale,
  t,
}: {
  summary?: SentimentSummaryData | null
  generatedAt?: string | null
  locale: Locale
  t: Labels
}) {
  if (!summary) {
    return (
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
    )
  }

  const number = (value: number) => value.toLocaleString(locale)
  const score = (value: number) =>
    value.toLocaleString(locale, { maximumFractionDigits: 2 })

  return (
    <section
      className="border-t border-ui-border-base pt-6"
      aria-label={t.sentiment}
    >
      <h2 className="text-base font-medium">{t.sentiment}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t.sentimentTotal, value: number(summary.total) },
          {
            label: t.positive,
            value: `${number(summary.positive)} · ${percent(
              summary.positive_ratio,
              locale
            )}`,
          },
          { label: t.neutral, value: number(summary.neutral) },
          {
            label: t.negative,
            value: `${number(summary.negative)} · ${percent(
              summary.negative_ratio,
              locale
            )}`,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4"
          >
            <dt className="text-sm text-ui-fg-subtle">{item.label}</dt>
            <dd className="mt-2 text-xl font-medium tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ui-fg-subtle">{t.averageScore}</dt>
          <dd className="mt-1 font-medium tabular-nums">
            {score(summary.average_score)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ui-fg-subtle">{t.averageRating}</dt>
          <dd className="mt-1 font-medium tabular-nums">
            {score(summary.average_rating)} / 5
          </dd>
        </div>
      </dl>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Terms
          title={t.topPositiveTerms}
          terms={summary.top_positive_terms}
          empty={t.noTerms}
          locale={locale}
        />
        <Terms
          title={t.topNegativeTerms}
          terms={summary.top_negative_terms}
          empty={t.noTerms}
          locale={locale}
        />
      </div>
      {generatedAt && (
        <p className="mt-5 text-xs text-ui-fg-muted">
          {t.sentimentUpdated}：
          {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(generatedAt))}
        </p>
      )}
    </section>
  )
}
