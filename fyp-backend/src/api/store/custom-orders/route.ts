import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../modules/custom-order"
import type { CustomOrderRequestBody } from "../../contracts"

const toLimit = (value: unknown, fallback = 20) =>
  Math.min(Math.max(Number(value) || fallback, 1), 100)

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { limit = 20, offset = 0, artisan_id, customer_id, status } = req.query
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const take = toLimit(limit)
  const skip = Math.max(Number(offset) || 0, 0)

  const [customOrders, count] = await service.listAndCountCustomOrderRequests(
    {
      ...(artisan_id ? { artisan_id: String(artisan_id) } : {}),
      ...(customer_id ? { customer_id: String(customer_id) } : {}),
      ...(status ? { status: String(status) } : {}),
    },
    { take, skip, order: { created_at: "DESC" } }
  )

  res.json({ custom_orders: customOrders, count, limit: take, offset: skip })
}

export const POST = async (
  req: MedusaRequest<CustomOrderRequestBody>,
  res: MedusaResponse
) => {
  const body = req.body || ({} as CustomOrderRequestBody)

  if (!body.artisan_id || !body.title || !body.description) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "artisan_id, title and description are required"
    )
  }

  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const customOrder = await service.createCustomOrderRequests({
    artisan_id: body.artisan_id,
    customer_id: body.customer_id ?? null,
    title: body.title,
    product_category: body.product_category?.trim() || "custom",
    description: body.description,
    budget_amount: body.budget_amount ?? null,
    currency_code: body.currency_code || "cny",
    metadata: body.metadata ?? null,
    status: "request",
  })

  res.status(201).json({ custom_order: customOrder })
}
