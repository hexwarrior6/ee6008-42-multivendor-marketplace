import { ArtisanProfile } from "@lib/data/artisans"
import { HttpTypes } from "@medusajs/types"
import ProductPreview from "@modules/products/components/product-preview"
import ArtisanHero from "../components/artisan-hero"
import ArtisanMediaFeed from "../components/artisan-media-feed"
import ArtisanStory from "../components/artisan-story"
import { Heading, Text } from "@medusajs/ui"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type ArtisanTemplateProps = {
  artisan: ArtisanProfile
  products: HttpTypes.StoreProduct[]
  region: HttpTypes.StoreRegion
  countryCode: string
  locale: StorefrontLocale
}

const ArtisanTemplate = ({
  artisan,
  products,
  region,
  countryCode,
  locale,
}: ArtisanTemplateProps) => {
  const t = getStorefrontDictionary(locale).artisan

  return (
    <>
      <ArtisanHero
        artisan={artisan}
        countryCode={countryCode}
        locale={locale}
      />
      <ArtisanStory artisan={artisan} locale={locale} />
      <ArtisanMediaFeed media={artisan.media} locale={locale} />
      <section className="content-container py-12 small:py-16 border-t border-ui-border-base">
        <div className="flex flex-col gap-2 mb-8">
          <Heading level="h2" className="text-2xl font-normal">
            {t.productsBy} {artisan.display_name}
          </Heading>
          <Text className="text-ui-fg-subtle">{t.productsIntro}</Text>
        </div>
        {products.length ? (
          <ul className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
            {products.map((product) => (
              <li key={product.id}>
                <ProductPreview product={product} region={region} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="border border-ui-border-base bg-ui-bg-subtle px-6 py-8">
            <Text className="text-ui-fg-subtle">{t.noProducts}</Text>
          </div>
        )}
      </section>
    </>
  )
}

export default ArtisanTemplate
