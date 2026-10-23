"use server"

import { sdk } from "@lib/config"
import { sortProducts } from "@lib/util/sort-products"
import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders } from "./cookies"
import { getRegion, retrieveRegion } from "./regions"
import { StoreProductWithStore } from "types/global"
import { StoreListProductReviewsQuery, StoreListProductReviewStatsQuery, 
StoreUpsertProductReviewsDTO } from "@lambdacurry/medusa-plugins-sdk"


export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductListParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductListParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = _pageParam === 1 ? 0 : (_pageParam - 1) * limit

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<{ products: StoreProductWithStore[]; count: number }>(
      `/store/products`,
      {
        method: "GET",
        query: {
          limit,
          offset,
          region_id: region?.id,
          fields:
            "*variants.calculated_price,+variants.inventory_quantity,*variants.images,+metadata,+tags,store.*",
          ...queryParams,
        },
        headers,
        // Catalog edits must be visible without relying on a revalidation webhook.
        cache: "no-store",
      }
    )
    .then(({ products, count }) => {
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products,
          count,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

/**
 * Latest arrivals are ordered and paginated by the API across the full catalog.
 * Price sorting uses up to 100 fresh products until the API supports price ordering.
 */
export const listProductsWithSort = async ({
  page = 1,
  queryParams,
  sortBy = "created_at",
  countryCode,
}: {
  page?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy?: SortOptions
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  const limit = queryParams?.limit || 12
  const currentPage = Math.max(page, 1)

  if (sortBy === "created_at") {
    return listProducts({
      pageParam: currentPage,
      queryParams: { ...queryParams, limit, order: "-created_at" },
      countryCode,
    })
  }

  const {
    response: { products, count },
  } = await listProducts({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      limit: 100,
    },
    countryCode,
  })

  const sortedProducts = sortProducts(products, sortBy)

  const pageParam = (currentPage - 1) * limit

  const nextPage = count > pageParam + limit ? currentPage + 1 : null

  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count,
    },
    nextPage,
    queryParams,
  }
}

export const getProductReviews = async (
  query: Partial<StoreListProductReviewsQuery>
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }
  return await sdk.store.productReviews.list({
    ...query,
    offset: query.offset ?? 0,
    limit: query.limit ?? 10,
  }, headers)
}

export const getProductReviewStats = async (query: StoreListProductReviewStatsQuery = { offset: 0, limit: 10 }) => {
  const headers = {
      ...(await getAuthHeaders()),
    }
    return await sdk.store.productReviews.listStats(query, headers)
}

export const addProductReview = async (input: StoreUpsertProductReviewsDTO,
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }
  return sdk.store.productReviews.upsert(
    input,
    headers
  )
}
