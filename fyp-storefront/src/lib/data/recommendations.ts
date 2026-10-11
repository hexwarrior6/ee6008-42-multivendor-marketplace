"use server"

import { sdk } from "@lib/config"

/** Public product-context recommendations; no customer identity is sent. */
export async function listRecommendedProductIds(
  productId: string
): Promise<string[]> {
  try {
    const result = await sdk.client.fetch<{
      recommendations: Array<{ product_id: string }>
    }>("/store/recommendations", {
      method: "GET",
      query: { product_id: productId, limit: 8 },
      cache: "no-store",
    })
    return [...new Set(result.recommendations.map((item) => item.product_id))]
  } catch {
    // Recommendation failures must not prevent viewing/buying a product.
    return []
  }
}
