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
import {
  assertCustomOrderAccess,
  requireCustomerContext,
} from "../../../../utils/authz"
import {
  normalizePagination,
  validateAttachments,
} from "../../../../utils/validation"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, { allowBackoffice: false })
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
  const customer = requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, { allowBackoffice: false })
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
    // Sender identity is derived from the authenticated customer. Any
    // sender_type/sender_id sent by the browser is intentionally ignored.
    sender_type: "customer",
    sender_id: customer.actor_id,
    message: body.message.trim(),
    attachments: attachments as unknown as Record<string, unknown> | null,
  })

  res.status(201).json({ message: created })
}
