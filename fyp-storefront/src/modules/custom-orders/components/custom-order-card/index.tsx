import { Button, Text } from "@medusajs/ui"

import type { CustomOrder } from "@lib/data/custom-orders"
import { convertToLocale } from "@lib/util/money"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

export default function CustomOrderCard({
  order,
  locale,
}: {
  order: CustomOrder
  locale: StorefrontLocale
}) {
  const t = getStorefrontDictionary(locale).customOrder

  return (
    <article
      className="border border-ui-border-base p-5"
      data-testid="custom-order-card"
    >
      <div className="flex flex-col small:flex-row small:items-start small:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium text-ui-fg-base">
              {order.title}
            </h2>
            <span className="border border-ui-border-base px-2 py-1 text-xs uppercase text-ui-fg-muted">
              {t.status[order.status]}
            </span>
          </div>
          <Text className="text-ui-fg-muted mt-2">
            {order.product_category} ·{" "}
            {new Date(order.created_at).toLocaleDateString(locale)}
          </Text>
          <Text className="mt-3 line-clamp-2">{order.description}</Text>
          <Text className="mt-3 font-medium">
            {t.budget}:{" "}
            {order.budget_amount === null
              ? t.notSpecified
              : convertToLocale({
                  amount: order.budget_amount / 100,
                  currency_code: order.currency_code,
                })}
          </Text>
        </div>
        <LocalizedClientLink href={`/account/custom-orders/${order.id}`}>
          <Button variant="secondary">{t.viewRequest}</Button>
        </LocalizedClientLink>
      </div>
    </article>
  )
}
