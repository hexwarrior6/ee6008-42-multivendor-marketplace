import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { RecommendationItem } from "../../contracts"

/**
 * Stable contract for S4's recommendation service. Until the model is wired
 * in, returning an empty list is intentional and keeps the storefront usable.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { product_id, customer_id, limit = 8 } = req.query
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 24)
  const recommendations: RecommendationItem[] = []

  res.json({
    recommendations,
    count: recommendations.length,
    limit: safeLimit,
    source: "model_pending",
    model_version: "contract-v1",
    context: {
      ...(product_id ? { product_id: String(product_id) } : {}),
      ...(customer_id ? { customer_id: String(customer_id) } : {}),
    },
  })
}
