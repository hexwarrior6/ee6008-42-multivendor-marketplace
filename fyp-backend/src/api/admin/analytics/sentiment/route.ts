import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { readApiSentiment } from "../../../../modules/recommendation/sentiment-api"
import { getBackofficeAccess } from "../../../utils/authz"
import { parseAnalyticsStoreId } from "../../../utils/analytics"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const access = await getBackofficeAccess(req)
  const requestedStoreId = parseAnalyticsStoreId(req.query.store_id)
  if (
    !access.isPlatformAdmin &&
    requestedStoreId &&
    !access.storeIds.includes(requestedStoreId)
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can only query analytics for your own store"
    )
  }
  // A seller request without a selector is safe only when ownership resolves
  // to exactly one store. Never guess across multiple stores or call overall.
  const storeId = access.isPlatformAdmin
    ? requestedStoreId
    : requestedStoreId ||
      (access.storeIds.length === 1 ? access.storeIds[0] : undefined)
  res.setHeader("Cache-Control", "private, no-store")
  if (!access.isPlatformAdmin && !storeId) {
    return res.json({
      summary: null,
      dimension: "unavailable",
      context: {},
      model_version: null,
      generated_at: null,
      source: "unavailable",
    })
  }
  return res.json(await readApiSentiment({ storeId }))
}
