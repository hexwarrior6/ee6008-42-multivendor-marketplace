import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../../modules/custom-order"
import { assertCustomOrderAccess } from "../../../../utils/authz"
import { normalizePagination } from "../../../../utils/validation"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, {
    allowCustomer: false,
    allowBackoffice: true,
  })
  const { limit, offset } = normalizePagination(req.query)
  const [history, count] = await service.listAndCountCustomOrderStatusHistories(
    { custom_order_id: req.params.id },
    { take: limit, skip: offset, order: { created_at: "ASC" } }
  )
  res.json({
    history,
    count,
    limit,
    offset,
    has_more: offset + history.length < count,
  })
}
