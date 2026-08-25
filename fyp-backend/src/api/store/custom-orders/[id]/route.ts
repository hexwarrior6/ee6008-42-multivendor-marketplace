import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../modules/custom-order"
import type { CustomOrderStatus } from "../../../contracts"

type UpdateCustomOrderBody = {
  status?: CustomOrderStatus
  quoted_amount?: number | null
  metadata?: Record<string, unknown> | null
}

const transitions: Record<CustomOrderStatus, CustomOrderStatus[]> = {
  request: ["quote", "cancelled"],
  quote: ["confirmed", "cancelled"],
  confirmed: ["produced", "cancelled"],
  produced: ["delivered"],
  delivered: [],
  cancelled: [],
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

  if (body.status && body.status !== current.status) {
    const allowed = transitions[current.status as CustomOrderStatus] || []
    if (!allowed.includes(body.status)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot move custom order from ${current.status} to ${body.status}`
      )
    }
  }

  const customOrder = await service.updateCustomOrderRequests({
    id: current.id,
    ...(body.status ? { status: body.status } : {}),
    ...(body.quoted_amount !== undefined
      ? { quoted_amount: body.quoted_amount }
      : {}),
    ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
  })

  res.json({ custom_order: customOrder })
}
