import { Heading, Text } from "@medusajs/ui"

import type { ArtisanProfile } from "@lib/data/artisans"
import type { CustomOrder, TalkJsSession } from "@lib/data/custom-orders"
import { convertToLocale } from "@lib/util/money"
import CustomOrderChat from "@modules/custom-orders/components/chat"
import CustomOrderStatusTimeline from "@modules/custom-orders/components/status-timeline"

type CustomOrderDetailTemplateProps = {
  order: CustomOrder
  artisan: ArtisanProfile | null
  talkJsSession: TalkJsSession
}

function formatAmount(amount: number | null, currencyCode: string) {
  return amount === null
    ? "Not specified"
    : convertToLocale({
        amount: amount / 100,
        currency_code: currencyCode,
      })
}

export default function CustomOrderDetailTemplate({
  order,
  artisan,
  talkJsSession,
}: CustomOrderDetailTemplateProps) {
  return (
    <div className="w-full">
      <div className="mb-8">
        <Text className="text-ui-fg-muted mb-2">Custom order</Text>
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
          Order progress
        </Heading>
        <CustomOrderStatusTimeline status={order.status} />
        {order.status === "cancelled" && order.cancellation_reason && (
          <Text className="text-ui-fg-muted mt-3">
            Reason: {order.cancellation_reason}
          </Text>
        )}
      </section>

      <section
        aria-labelledby="request-heading"
        className="py-7 border-b border-ui-border-base"
      >
        <Heading id="request-heading" level="h2" className="text-lg mb-5">
          Request details
        </Heading>
        <dl className="grid grid-cols-1 small:grid-cols-[11rem_1fr] gap-x-8 gap-y-4">
          <dt className="text-ui-fg-muted">Artisan</dt>
          <dd>{artisan?.display_name || order.artisan_id}</dd>
          <dt className="text-ui-fg-muted">Category</dt>
          <dd>{order.product_category}</dd>
          <dt className="text-ui-fg-muted">Requested</dt>
          <dd>{new Date(order.created_at).toLocaleString()}</dd>
          <dt className="text-ui-fg-muted">Budget</dt>
          <dd>{formatAmount(order.budget_amount, order.currency_code)}</dd>
          <dt className="text-ui-fg-muted">Artisan quote</dt>
          <dd>{formatAmount(order.quoted_amount, order.currency_code)}</dd>
          <dt className="text-ui-fg-muted">Payment</dt>
          <dd className="capitalize">{order.payment_status}</dd>
          <dt className="text-ui-fg-muted">Description</dt>
          <dd className="whitespace-pre-wrap">{order.description}</dd>
        </dl>
      </section>

      <section aria-labelledby="messages-heading" className="py-7">
        <Heading id="messages-heading" level="h2" className="text-lg">
          Messages
        </Heading>
        <CustomOrderChat session={talkJsSession} />
      </section>
    </div>
  )
}
