import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../../modules/custom-order"
import type { CustomOrderMessageBody } from "../../../../contracts"

const senderTypes = ["customer", "artisan", "admin"] as const

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  await service.retrieveCustomOrderRequest(req.params.id)
  const messages = await service.listCustomOrderMessages(
    { custom_order_id: req.params.id },
    { order: { created_at: "ASC" } }
  )

  res.json({ messages, count: messages.length })
}

export const POST = async (
  req: MedusaRequest<CustomOrderMessageBody>,
  res: MedusaResponse
) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  await service.retrieveCustomOrderRequest(req.params.id)
  const body = req.body || ({} as CustomOrderMessageBody)

  if (!senderTypes.includes(body.sender_type as (typeof senderTypes)[number])) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "sender_type must be customer, artisan or admin"
    )
  }
  if (!body.message?.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "message is required"
    )
  }
  if (body.message.length > 5000) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "message must be 5000 characters or fewer"
    )
  }

  const created = await service.createCustomOrderMessages({
    custom_order_id: req.params.id,
    sender_type: body.sender_type,
    sender_id: body.sender_id ?? null,
    message: body.message.trim(),
    attachments: body.attachments as unknown as Record<string, unknown> | null,
  })

  res.status(201).json({ message: created })
}
