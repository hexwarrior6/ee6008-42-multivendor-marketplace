import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  rankRecommendations,
  type RecommendationProduct,
} from "../../../modules/recommendation/ranking"

import {
  readRecommendationArtifact,
  recommendationLists,
} from "../../../modules/recommendation/artifact"

const CANDIDATE_LIMIT = 200
const fields = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "status",
  "created_at",
  "categories.id",
  "categories.is_active",
  "categories.is_internal",
  "variants.id",
]

function optionalId(value: unknown, name: string) {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid ${name}`)
  }
  return value
}

/** S4 offline results, revalidated against live channel membership; rules on failure. */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const productId = optionalId(req.query.product_id, "product_id")
  const customerId = optionalId(req.query.customer_id, "customer_id")
  const rawLimit = req.query.limit ?? "8"
  if (
    typeof rawLimit !== "string" ||
    !/^\d+$/.test(rawLimit) ||
    Number(rawLimit) < 1 ||
    Number(rawLimit) > 24
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "limit must be an integer between 1 and 24"
    )
  }
  const limit = Number(rawLimit)
  if (
    customerId &&
    (req.auth_context?.actor_type !== "customer" ||
      customerId !== req.auth_context.actor_id)
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "customer_id must match the signed-in customer"
    )
  }
  const channelIds = req.publishable_key_context?.sales_channel_ids || []
  if (!channelIds.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A publishable key with a sales channel is required"
    )
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // Resolve channel membership through the link entry point, never by accepting
  // a caller-supplied sales_channel_id or by querying all products globally.
  const { data: links = [] } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: { sales_channel_id: channelIds },
    pagination: {
      take: CANDIDATE_LIMIT,
      skip: 0,
      order: { product_id: "ASC" },
    },
  })
  const ids = [
    ...new Set(links.map((link: { product_id: string }) => link.product_id)),
  ]
  let seed: RecommendationProduct | undefined
  if (productId) {
    const { data: membership = [] } = await query.graph({
      entity: "product_sales_channel",
      fields: ["product_id"],
      filters: { sales_channel_id: channelIds, product_id: productId },
      pagination: { take: 1, skip: 0 },
    })
    if (membership.length) {
      const { data = [] } = await query.graph({
        entity: "product",
        fields,
        filters: { id: productId, status: "published" },
        pagination: { take: 1, skip: 0 },
      })
      seed = data[0] as RecommendationProduct | undefined
    }
    if (!seed || seed.status !== "published" || !seed.variants?.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
    }
  }
  const signedInCustomerId =
    req.auth_context?.actor_type === "customer"
      ? optionalId(req.auth_context.actor_id, "authenticated customer")
      : undefined
  const loaded = await readRecommendationArtifact()
  if (loaded.artifact) {
    for (const list of recommendationLists(
      loaded.artifact,
      signedInCustomerId,
      productId
    )) {
      const unique = [
        ...new Map(
          list.items
            .filter((item) => item.product_id !== productId)
            .map((item) => [item.product_id, item])
        ).values(),
      ]
      if (!unique.length) continue
      const { data: membership = [] } = await query.graph({
        entity: "product_sales_channel",
        fields: ["product_id"],
        filters: {
          sales_channel_id: channelIds,
          product_id: unique.map((item) => item.product_id),
        },
        pagination: {
          take: Math.min(unique.length * channelIds.length, 2000),
          skip: 0,
        },
      })
      const allowed = new Set(
        membership.map((link: { product_id: string }) => link.product_id)
      )
      const allowedIds = unique
        .filter((item) => allowed.has(item.product_id))
        .map((item) => item.product_id)
      if (!allowedIds.length) continue
      const { data: current = [] } = await query.graph({
        entity: "product",
        fields,
        filters: { id: allowedIds, status: "published" },
        pagination: { take: allowedIds.length, skip: 0 },
      })
      const visible = new Map(
        (current as RecommendationProduct[])
          .filter(
            (p) =>
              allowed.has(p.id) &&
              p.status === "published" &&
              p.variants?.length
          )
          .map((p) => [p.id, p])
      )
      const recommendations = unique
        .filter((item) => visible.has(item.product_id))
        .slice(0, limit)
        .map((item) => {
          const p = visible.get(item.product_id)!
          return {
            product_id: p.id,
            title: p.title,
            handle: p.handle,
            thumbnail: p.thumbnail,
            score: item.score,
            ...(typeof item.reason === "string" ? { reason: item.reason } : {}),
          }
        })
      if (!recommendations.length) continue
      res.setHeader("Cache-Control", "private, no-store")
      res.json({
        recommendations,
        count: recommendations.length,
        limit,
        source: loaded.artifact.source,
        model_version: loaded.artifact.model_version,
        generated_at: loaded.artifact.generated_at,
        strategy: list.strategy,
        personalized: list.strategy === "by_user",
        candidate_limit: 200,
        context: {
          ...(productId ? { product_id: productId } : {}),
          ...(signedInCustomerId ? { customer_id: signedInCustomerId } : {}),
        },
      })
      return
    }
  }
  const { data: products = [] } = ids.length
    ? await query.graph({
        entity: "product",
        fields,
        filters: { id: ids, status: "published" },
        pagination: {
          take: CANDIDATE_LIMIT,
          skip: 0,
          order: { created_at: "DESC", id: "ASC" },
        },
      })
    : { data: [] }
  const recommendations = rankRecommendations(
    products as RecommendationProduct[],
    seed,
    limit
  )
  res.setHeader("Cache-Control", "private, no-store")
  res.json({
    recommendations,
    count: recommendations.length,
    limit,
    source: "rules",
    model_version: "category-recency-v1",
    personalized: false,
    strategy: "rules",
    fallback_reason: loaded.reason ?? "no_visible_results",
    candidate_limit: CANDIDATE_LIMIT,
    context: {
      ...(productId ? { product_id: productId } : {}),
      ...(signedInCustomerId ? { customer_id: signedInCustomerId } : {}),
    },
  })
}
