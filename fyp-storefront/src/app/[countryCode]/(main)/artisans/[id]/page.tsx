import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listArtisanProducts, retrieveArtisanProfile } from "@lib/data/artisans"
import { getRegion } from "@lib/data/regions"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"
import ArtisanTemplate from "@modules/artisans/templates"
import { getStorefrontDictionary } from "@lib/i18n/storefront"

type Props = {
  params: Promise<{ countryCode: string; id: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const [artisan, locale] = await Promise.all([
    retrieveArtisanProfile(params.id),
    getStorefrontLocale(),
  ])
  const t = getStorefrontDictionary(locale).artisan

  if (!artisan) {
    return {
      title: `${t.metadataNotFound} | ${getStorefrontDictionary(locale).shell.brand}`,
    }
  }

  return {
    title: `${artisan.display_name} | ${t.metadataTitle}`,
    description:
      artisan.bio || `${artisan.display_name} ${t.metadataDescription}`,
  }
}

export default async function ArtisanPage(props: Props) {
  const params = await props.params
  const [region, locale] = await Promise.all([
    getRegion(params.countryCode),
    getStorefrontLocale(),
  ])

  if (!region) {
    notFound()
  }

  const artisan = await retrieveArtisanProfile(params.id)

  if (!artisan) {
    notFound()
  }

  const products = await listArtisanProducts({
    storeId: artisan.store_id,
    countryCode: params.countryCode,
  })

  return (
    <ArtisanTemplate
      artisan={artisan}
      products={products}
      region={region}
      countryCode={params.countryCode}
      locale={locale}
    />
  )
}
