import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../modules/custom-order"
import {
  assertCustomOrderTransition,
  isCustomOrderStatus,
} from "../../../../modules/custom-order/state-machine"
import type { CustomOrderStatus } from "../../../contracts"
import updateCustomOrderStatusWorkflow from "../../../../workflows/update-custom-order-status"

type UpdateCustomOrderBody = {
  status?: CustomOrderStatus
  quoted_amount?: number | null
  product_category?: string
  metadata?: Record<string, unknown> | null
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const customOrder = await service.retrieveCustomOrderRequest(req.params.id)
  res.json({ custom_order: customOrder })
}

export const PATCH = async (
  req: MedusaRequest<UpdateCustomOrderBody>,
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

  let customOrder = current
  if (body.status && body.status !== current.status) {
    assertCustomOrderTransition(current.status as CustomOrderStatus, body.status)
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
    if (body.product_category !== undefined) {
      const category =
        typeof body.product_category === "string"
          ? body.product_category.trim()
          : ""
      if (!category || category.length > 100) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "product_category must be between 1 and 100 characters"
        )
      }
    }
    if (
      body.quoted_amount !== null &&
      body.quoted_amount !== undefined &&
      (typeof body.quoted_amount !== "number" ||
        !Number.isFinite(body.quoted_amount) ||
        body.quoted_amount < 0)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "quoted_amount must be a non-negative number"
      )
    }
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
