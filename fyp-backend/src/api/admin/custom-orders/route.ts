import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../modules/custom-order"
import {
  isCustomOrderStatus,
  type CustomOrderStatus,
} from "../../../modules/custom-order/state-machine"
import { getBackofficeAccess, getAccessibleArtisanIds } from "../../utils/authz"
import { normalizePagination } from "../../utils/validation"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const access = await getBackofficeAccess(req)
  const {
    artisan_id,
    customer_id,
    status,
    product_category,
  } = req.query

  if (status !== undefined && !isCustomOrderStatus(String(status))) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid custom order status"
    )
  }

  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const { limit, offset } = normalizePagination(req.query)
  let accessibleArtisanIds: string[] | undefined
  if (!access.isPlatformAdmin) {
    accessibleArtisanIds = await getAccessibleArtisanIds(req, access.storeIds)
    if (artisan_id && !accessibleArtisanIds.includes(String(artisan_id))) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You can only list orders assigned to your store"
      )
    }
    if (!accessibleArtisanIds.length) {
      return res.json({
        custom_orders: [],
        count: 0,
        limit,
        offset,
        has_more: false,
      })
    }
  }

  const [customOrders, count] = await service.listAndCountCustomOrderRequests(
    {
      ...(artisan_id
        ? { artisan_id: String(artisan_id) }
        : accessibleArtisanIds
          ? { artisan_id: accessibleArtisanIds }
          : {}),
      ...(access.isPlatformAdmin && customer_id
        ? { customer_id: String(customer_id) }
        : {}),
      ...(status ? { status: String(status) as CustomOrderStatus } : {}),
      ...(product_category
        ? { product_category: String(product_category) }
        : {}),
    },
    { take: limit, skip: offset, order: { created_at: "DESC" } }
  )

  res.json({
    custom_orders: customOrders,
    count,
    limit,
    offset,
    has_more: offset + customOrders.length < count,
  })
}
