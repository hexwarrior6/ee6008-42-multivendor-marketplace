import { Metadata } from "next"

import { listCustomOrders } from "@lib/data/custom-orders"
import CustomOrderOverview from "@modules/custom-orders/components/custom-order-overview"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export const metadata: Metadata = {
  title: "Custom orders",
  description: "Track your custom order requests.",
}

export default async function CustomOrdersPage() {
  const [orders, locale] = await Promise.all([
    listCustomOrders(),
    getStorefrontLocale(),
  ])
  const t = getStorefrontDictionary(locale).customOrder

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl-semi">{t.listTitle}</h1>
        <p className="text-base-regular mt-3">{t.listIntro}</p>
      </div>
      <CustomOrderOverview orders={orders} locale={locale} />
    </div>
  )
}
