import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listArtisanProducts, retrieveArtisanProfile } from "@lib/data/artisans"
import { getRegion } from "@lib/data/regions"
import ArtisanTemplate from "@modules/artisans/templates"

type Props = {
  params: Promise<{ countryCode: string; id: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const artisan = await retrieveArtisanProfile(params.id)

  if (!artisan) {
    return {
      title: "Artisan not found | Medusa Store",
    }
  }

  return {
    title: `${artisan.display_name} | Artisan Profile`,
    description:
      artisan.bio || `${artisan.display_name} artisan profile on Medusa Store`,
  }
}

export default async function ArtisanPage(props: Props) {
  const params = await props.params
  const region = await getRegion(params.countryCode)

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
    />
  )
}
