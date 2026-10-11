import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveArtisanProfile } from "@lib/data/artisans"
import { retrieveCustomer } from "@lib/data/customer"
import { getRegion } from "@lib/data/regions"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import CustomOrderRequestTemplate from "@modules/custom-orders/templates/request-template"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const dictionary = getStorefrontDictionary(locale)

  return {
    title: `${dictionary.customOrder.requestEyebrow} | ${dictionary.shell.brand}`,
    description: dictionary.customOrder.requestIntro,
  }
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

  const [artisan, customer, region, locale] = await Promise.all([
    retrieveArtisanProfile(artisanId),
    retrieveCustomer().catch(() => null),
    getRegion(countryCode),
    getStorefrontLocale(),
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
      locale={locale}
    />
  )
}
