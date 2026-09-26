import { Heading, Text } from "@medusajs/ui"

import type { ArtisanProfile } from "@lib/data/artisans"
import type { CustomOrder, TalkJsSession } from "@lib/data/custom-orders"
import { convertToLocale } from "@lib/util/money"
import CustomOrderChat from "@modules/custom-orders/components/chat"
import CustomOrderStatusTimeline from "@modules/custom-orders/components/status-timeline"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type CustomOrderDetailTemplateProps = {
  order: CustomOrder
  artisan: ArtisanProfile | null
  talkJsSession: TalkJsSession | null
  locale: StorefrontLocale
}

function formatAmount(
  amount: number | null,
  currencyCode: string,
  notSpecified: string,
  locale: StorefrontLocale
) {
  return amount === null
    ? notSpecified
    : convertToLocale({
        amount: amount / 100,
        currency_code: currencyCode,
        locale,
      })
}

export default function CustomOrderDetailTemplate({
  order,
  artisan,
  talkJsSession,
  locale,
}: CustomOrderDetailTemplateProps) {
  const t = getStorefrontDictionary(locale).customOrder

  return (
    <div className="w-full">
      <div className="mb-8">
        <Text className="text-ui-fg-muted mb-2">{t.customOrder}</Text>
        <Heading level="h1" className="text-2xl">
          {order.title}
        </Heading>
        <Text className="text-ui-fg-muted mt-2 break-all">{order.id}</Text>
      </div>

      <section
        aria-labelledby="progress-heading"
        className="border-y border-ui-border-base py-7"
      >
        <Heading id="progress-heading" level="h2" className="text-lg mb-6">
          {t.orderProgress}
        </Heading>
        <CustomOrderStatusTimeline status={order.status} locale={locale} />
        {order.status === "cancelled" && order.cancellation_reason && (
          <Text className="text-ui-fg-muted mt-3">
            {t.reason}: {order.cancellation_reason}
          </Text>
        )}
      </section>

      <section
        aria-labelledby="request-heading"
        className="py-7 border-b border-ui-border-base"
      >
        <Heading id="request-heading" level="h2" className="text-lg mb-5">
          {t.requestDetails}
        </Heading>
        <dl className="grid grid-cols-1 small:grid-cols-[11rem_1fr] gap-x-8 gap-y-4">
          <dt className="text-ui-fg-muted">{t.artisan}</dt>
          <dd>{artisan?.display_name || order.artisan_id}</dd>
          <dt className="text-ui-fg-muted">{t.category}</dt>
          <dd>{order.product_category}</dd>
          <dt className="text-ui-fg-muted">{t.requested}</dt>
          <dd>{new Date(order.created_at).toLocaleString(locale)}</dd>
          <dt className="text-ui-fg-muted">{t.budget}</dt>
          <dd>
            {formatAmount(
              order.budget_amount,
              order.currency_code,
              t.notSpecified,
              locale
            )}
          </dd>
          <dt className="text-ui-fg-muted">{t.artisanQuote}</dt>
          <dd>
            {formatAmount(
              order.quoted_amount,
              order.currency_code,
              t.notSpecified,
              locale
            )}
          </dd>
          <dt className="text-ui-fg-muted">{t.payment}</dt>
          <dd className="capitalize">{order.payment_status}</dd>
          <dt className="text-ui-fg-muted">{t.description}</dt>
          <dd className="whitespace-pre-wrap">{order.description}</dd>
        </dl>
      </section>

      <section aria-labelledby="messages-heading" className="py-7">
        <Heading id="messages-heading" level="h2" className="text-lg">
          {t.messages}
        </Heading>
        {talkJsSession ? (
          <CustomOrderChat session={talkJsSession} />
        ) : (
          <div
            role="status"
            className="mt-4 flex items-center justify-center border border-ui-border-base bg-ui-bg-subtle px-4 py-10"
          >
            <Text className="text-ui-fg-muted">{t.chatUnavailable}</Text>
          </div>
        )}
      </section>
    </div>
  )
}
