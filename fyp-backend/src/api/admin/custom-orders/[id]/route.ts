import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../modules/custom-order"
import {
  assertCustomOrderTransition,
  isCustomOrderStatus,
  type CustomOrderStatus,
} from "../../../../modules/custom-order/state-machine"
import updateCustomOrderStatusWorkflow from "../../../../workflows/update-custom-order-status"

type UpdateCustomOrderBody = {
  status?: CustomOrderStatus
  quoted_amount?: number | null
  product_category?: string
  metadata?: Record<string, unknown> | null
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const customOrder = await service.retrieveCustomOrderRequest(req.params.id)
  res.json({ custom_order: customOrder })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<UpdateCustomOrderBody>,
  res: MedusaResponse
) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const current = await service.retrieveCustomOrderRequest(req.params.id)
  const body = req.body || {}

  if (body.status !== undefined && !isCustomOrderStatus(body.status)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid custom order status"
    )
  }

  if (body.product_category !== undefined) {
    const category = body.product_category.trim()
    if (!category || category.length > 100) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "product_category must be between 1 and 100 characters"
      )
    }
  }

  if (body.status && body.status !== current.status) {
    assertCustomOrderTransition(current.status as CustomOrderStatus, body.status)
  }

  let customOrder = current
  if (body.status && body.status !== current.status) {
    const { result } = await updateCustomOrderStatusWorkflow.run({
      input: { customOrderId: current.id, status: body.status },
      container: req.scope,
    })
    customOrder = result as typeof current
  }

  if (
    body.quoted_amount !== undefined ||
    body.metadata !== undefined ||
    body.product_category !== undefined
  ) {
    customOrder = await service.updateCustomOrderRequests({
      id: current.id,
      ...(body.quoted_amount !== undefined
        ? { quoted_amount: body.quoted_amount }
        : {}),
      ...(body.product_category !== undefined
        ? { product_category: body.product_category.trim() }
        : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    })
  }

  res.json({ custom_order: customOrder })
}
