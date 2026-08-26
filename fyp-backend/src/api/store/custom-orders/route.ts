import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../modules/custom-order"
import { isCustomOrderStatus } from "../../../modules/custom-order/state-machine"
import type { CustomOrderRequestBody } from "../../contracts"

const toLimit = (value: unknown, fallback = 20) =>
  Math.min(Math.max(Number(value) || fallback, 1), 100)

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { limit = 20, offset = 0, artisan_id, customer_id, status } = req.query
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
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description =
    typeof body.description === "string" ? body.description.trim() : ""
  const category =
    typeof body.product_category === "string"
      ? body.product_category.trim()
      : "custom"
  const currencyCode =
    typeof body.currency_code === "string"
      ? body.currency_code.trim().toLowerCase()
      : "cny"

  if (!body.artisan_id || !title || !description) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "artisan_id, title and description are required"
    )
  }
  if (title.length > 200 || description.length > 5000) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "title must be 200 characters or fewer and description 5000 characters or fewer"
    )
  }
  if (!category || category.length > 100) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "product_category must be between 1 and 100 characters"
    )
  }
  if (!/^[a-z]{3}$/.test(currencyCode)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "currency_code must be a 3-letter ISO currency code"
    )
  }
  if (
    body.budget_amount !== null &&
    body.budget_amount !== undefined &&
    (typeof body.budget_amount !== "number" ||
      !Number.isFinite(body.budget_amount) ||
      body.budget_amount < 0)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "budget_amount must be a non-negative number"
    )
  }

  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const customOrder = await service.createCustomOrderRequests({
    artisan_id: body.artisan_id,
    customer_id: body.customer_id ?? null,
    title,
    product_category: category,
    description,
    budget_amount: body.budget_amount ?? null,
    currency_code: currencyCode,
    metadata: body.metadata ?? null,
    status: "request",
  })

  res.status(201).json({ custom_order: customOrder })
}
