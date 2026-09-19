import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../../modules/custom-order"
import type { CustomOrderMessageBody } from "../../../../contracts"
import { assertCustomOrderAccess } from "../../../../utils/authz"
import {
  normalizePagination,
  validateAttachments,
} from "../../../../utils/validation"

const authorize = async (req: AuthenticatedMedusaRequest) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  const actor = await assertCustomOrderAccess(req, order, {
    allowCustomer: false,
    allowBackoffice: true,
  })
  return { service, order, actor }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { service } = await authorize(req)
  const { limit, offset } = normalizePagination(req.query)
  const [messages, count] = await service.listAndCountCustomOrderMessages(
    { custom_order_id: req.params.id },
    { take: limit, skip: offset, order: { created_at: "ASC" } }
  )
  res.json({
    messages,
    count,
    limit,
    offset,
    has_more: offset + messages.length < count,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CustomOrderMessageBody>,
  res: MedusaResponse
) => {
  const { service, actor } = await authorize(req)
  const body = req.body || ({} as CustomOrderMessageBody)

  if (typeof body.message !== "string" || !body.message.trim()) {
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

  const attachments = validateAttachments(body.attachments)
  const created = await service.createCustomOrderMessages({
    custom_order_id: req.params.id,
    // The role and id are taken from auth_context, never from the JSON body.
    sender_type: actor.actor_type,
    sender_id: actor.actor_id,
    message: body.message.trim(),
    attachments: attachments as unknown as Record<string, unknown> | null,
  })

  res.status(201).json({ message: created })
}
