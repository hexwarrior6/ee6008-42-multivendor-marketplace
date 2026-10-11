import { Metadata } from "next"

import Overview from "@modules/account/components/overview"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import { listOrders } from "@lib/data/orders"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).account

  return {
    title: t.accountTitle,
    description: t.accountDescription,
  }
}

export default async function OverviewTemplate() {
  const [customer, orders, locale] = await Promise.all([
    retrieveCustomer().catch(() => null),
    listOrders().catch(() => null),
    getStorefrontLocale(),
  ])

  if (!customer) {
    notFound()
  }

  return <Overview customer={customer} orders={orders} locale={locale} />
}
