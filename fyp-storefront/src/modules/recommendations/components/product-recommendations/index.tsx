import { HttpTypes } from "@medusajs/types"
import { listRecommendedProducts } from "@lib/data/recommendations"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRecommendations({
  region,
  productId,
}: {
  region: HttpTypes.StoreRegion
  productId?: string
}) {
  const products = await listRecommendedProducts({
    regionId: region.id,
    productId,
  })
  if (!products.length) return null

  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).recommendations

  return (
    <section
      className="content-container py-12 small:py-16"
      aria-label={t.title}
      data-testid="product-recommendations"
    >
      <div className="mb-8">
        <h2 className="text-2xl-semi">{t.title}</h2>
        <p className="mt-2 text-base-regular text-ui-fg-subtle">
          {productId ? t.productIntro : t.homeIntro}
        </p>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
        {products.map((product) => (
          <li key={product.id} className="min-w-0">
            <ProductPreview product={product} region={region} />
          </li>
        ))}
      </ul>
    </section>
  )
}
