import type { RecommendationItem } from "../../api/contracts"

export type RecommendationProduct = {
  id: string
  title: string
  handle?: string | null
  thumbnail?: string | null
  status: string
  created_at?: string | Date
  variants?: Array<{ id: string }>
  categories?: Array<{ id: string; is_active?: boolean; is_internal?: boolean }>
}

const publicCategories = (product?: RecommendationProduct) =>
  new Set(
    (product?.categories || [])
      .filter((c) => c.is_active === true && c.is_internal !== true)
      .map((c) => c.id)
  )
const timestamp = (product: RecommendationProduct) => {
  const value = new Date(product.created_at || 0).getTime()
  return Number.isFinite(value) ? value : 0
}

/** Prefer shared public categories; use recency and ID for stable cold-start ranking. */
export function rankRecommendations(
  products: RecommendationProduct[],
  seed: RecommendationProduct | undefined,
  limit: number
): RecommendationItem[] {
  const categories = publicCategories(seed)
  const unique = new Map(products.map((product) => [product.id, product]))
  return [...unique.values()]
    .filter(
      (product) =>
        product.id !== seed?.id &&
        product.status === "published" &&
        Boolean(product.variants?.length)
    )
    .map((product) => {
      const candidateCategories = publicCategories(product)
      const shared = [...candidateCategories].filter((id) =>
        categories.has(id)
      ).length
      const union = new Set([...categories, ...candidateCategories]).size
      return {
        product,
        score: shared ? 0.5 + (0.5 * shared) / union : 0.1,
        reason: shared ? "same_category" : "recently_added",
      }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        timestamp(b.product) - timestamp(a.product) ||
        a.product.id.localeCompare(b.product.id)
    )
    .slice(0, limit)
    .map(({ product, score, reason }) => ({
      product_id: product.id,
      title: product.title,
      handle: product.handle,
      thumbnail: product.thumbnail,
      score,
      reason,
    }))
}
