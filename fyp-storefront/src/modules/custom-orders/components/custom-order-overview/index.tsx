import { Button, Heading, Text } from "@medusajs/ui"

import type { CustomOrder } from "@lib/data/custom-orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CustomOrderCard from "@modules/custom-orders/components/custom-order-card"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

export default function CustomOrderOverview({
  orders,
  locale,
}: {
  orders: CustomOrder[]
  locale: StorefrontLocale
}) {
  const t = getStorefrontDictionary(locale).customOrder

  if (!orders.length) {
    return (
      <div className="border border-ui-border-base p-8 text-center">
        <Heading level="h2" className="text-lg">
          {t.noRequests}
        </Heading>
        <Text className="text-ui-fg-muted mt-2 mb-5">{t.noRequestsBody}</Text>
        <LocalizedClientLink href="/store">
          <Button variant="secondary">{t.browseProducts}</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <CustomOrderCard key={order.id} order={order} locale={locale} />
      ))}
    </div>
  )
}
