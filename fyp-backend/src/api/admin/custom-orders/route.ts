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

const toLimit = (value: unknown, fallback = 20) =>
  Math.min(Math.max(Number(value) || fallback, 1), 100)

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const {
    limit = 20,
    offset = 0,
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
  const take = toLimit(limit)
  const skip = Math.max(Number(offset) || 0, 0)
  const [customOrders, count] = await service.listAndCountCustomOrderRequests(
    {
      ...(artisan_id ? { artisan_id: String(artisan_id) } : {}),
      ...(customer_id ? { customer_id: String(customer_id) } : {}),
      ...(status ? { status: String(status) as CustomOrderStatus } : {}),
      ...(product_category
        ? { product_category: String(product_category) }
        : {}),
    },
    { take, skip, order: { created_at: "DESC" } }
  )

  res.json({ custom_orders: customOrders, count, limit: take, offset: skip })
}
