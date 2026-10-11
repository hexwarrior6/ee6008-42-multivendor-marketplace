import { Metadata } from "next"
import { notFound } from "next/navigation"

import AddressBook from "@modules/account/components/address-book"

import { getRegion } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/customer"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).account

  return {
    title: t.addressesTitle,
    description: t.addressesDescription,
  }
}

export default async function Addresses(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params
  const { countryCode } = params
  const [customer, region, locale] = await Promise.all([
    retrieveCustomer(),
    getRegion(countryCode),
    getStorefrontLocale(),
  ])

  if (!customer || !region) {
    notFound()
  }
  const t = getStorefrontDictionary(locale).account

  return (
    <div className="w-full" data-testid="addresses-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">{t.addressesTitle}</h1>
        <p className="text-base-regular">{t.addressesIntro}</p>
      </div>
      <AddressBook customer={customer} region={region} />
    </div>
  )
}
