import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveArtisanProfile } from "@lib/data/artisans"
import { retrieveCustomer } from "@lib/data/customer"
import { getRegion } from "@lib/data/regions"
import CustomOrderRequestTemplate from "@modules/custom-orders/templates/request-template"

export const metadata: Metadata = {
  title: "提交定制需求 | 手作市集",
  description: "向手艺人提交定制订单需求。",
}

type Props = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ artisan_id?: string | string[] }>
}

export default async function NewCustomOrderPage(props: Props) {
  const [{ countryCode }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  const artisanId = Array.isArray(searchParams.artisan_id)
    ? searchParams.artisan_id[0]
    : searchParams.artisan_id

  if (!artisanId) {
    notFound()
  }

  const [artisan, customer, region] = await Promise.all([
    retrieveArtisanProfile(artisanId),
    retrieveCustomer().catch(() => null),
    getRegion(countryCode),
  ])

  if (!artisan || !region) {
    notFound()
  }

  return (
    <CustomOrderRequestTemplate
      artisan={artisan}
      countryCode={countryCode}
      currencyCode={region.currency_code}
      isAuthenticated={Boolean(customer)}
    />
  )
}
