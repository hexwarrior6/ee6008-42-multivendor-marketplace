import "server-only"

import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { getAuthHeaders } from "./cookies"

export async function listRecommendedProducts({
  regionId,
  productId,
  limit = 4,
}: {
  regionId: string
  productId?: string
  limit?: number
}): Promise<HttpTypes.StoreProduct[]> {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(24, Math.max(1, Math.floor(limit)))
    : 4

  try {
    const headers = await getAuthHeaders()
    const customer =
      "authorization" in headers
        ? await sdk.client
            .fetch<{ customer: { id: string } }>("/store/customers/me", {
              method: "GET",
              query: { fields: "id" },
              headers,
              cache: "no-store",
              signal: AbortSignal.timeout(3000),
            })
            .then(({ customer }) => customer)
            .catch(() => null)
        : null

    const { recommendations } = await sdk.client.fetch<{
      recommendations: unknown
    }>("/store/recommendations", {
      method: "GET",
      query: {
        limit: safeLimit,
        ...(productId ? { product_id: productId } : {}),
        ...(customer?.id ? { customer_id: customer.id } : {}),
      },
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })

    if (!Array.isArray(recommendations)) return []

    const ids: string[] = []
    for (const item of recommendations) {
      const id = item?.product_id
      if (
        typeof id === "string" &&
        id.trim() &&
        id !== productId &&
        !ids.includes(id)
      ) {
        ids.push(id)
      }
      if (ids.length === safeLimit) break
    }
    if (!ids.length) return []

    // Rehydrate model IDs through the Store API for current availability and regional prices.
    const { products } = await sdk.client.fetch<{
      products: HttpTypes.StoreProduct[]
    }>("/store/products", {
      method: "GET",
      query: {
        id: ids,
        limit: ids.length,
        region_id: regionId,
        fields: "id,title,handle,thumbnail,*images,*variants.calculated_price",
      },
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })

    const byId = new Map(products.map((product) => [product.id, product]))
    return ids.flatMap((id) => {
      const product = byId.get(id)
      return product?.handle?.trim() ? [product] : []
    })
  } catch {
    return []
  }
}

/** Public product-context recommendations; no customer identity is sent. */
export async function listRecommendedProductIds(
  productId: string
): Promise<string[]> {
  try {
    const result = await sdk.client.fetch<{ recommendations: unknown }>(
      "/store/recommendations",
      {
        method: "GET",
        query: { product_id: productId, limit: 8 },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      }
    )
    if (!Array.isArray(result.recommendations)) return []
    const ids: string[] = []
    for (const item of result.recommendations) {
      const id = item?.product_id
      if (
        typeof id === "string" &&
        id.trim() &&
        id !== productId &&
        !ids.includes(id)
      ) {
        ids.push(id)
      }
      if (ids.length === 8) break
    }
    return ids
  } catch {
    // Recommendation failures must not prevent viewing/buying a product.
    return []
  }
}
