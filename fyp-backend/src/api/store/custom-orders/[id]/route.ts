import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../modules/custom-order"
import type { CustomOrderStatus } from "../../../contracts"
import {
  assertCustomOrderAccess,
  requireCustomerContext,
} from "../../../utils/authz"
import { validateMetadata } from "../../../utils/validation"

type UpdateCustomOrderBody = {
  status?: CustomOrderStatus
  quoted_amount?: number | null
  product_category?: string
  product_category_id?: string | null
  product_id?: string | null
  listing_type?: "custom_request" | "product"
  payment_status?: never
  cancellation_reason?: never
  metadata?: Record<string, unknown> | null
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const customOrder = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, customOrder, {
    allowBackoffice: false,
  })
  res.json({ custom_order: customOrder })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<UpdateCustomOrderBody>,
  res: MedusaResponse
) => {
  const customer = requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const current = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, current, { allowBackoffice: false })
  const body = req.body || {}

  if (
    body.status !== undefined ||
    body.quoted_amount !== undefined ||
    body.product_category !== undefined ||
    body.product_category_id !== undefined ||
    body.product_id !== undefined ||
    body.listing_type !== undefined
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Customers may only update custom order metadata"
    )
  }

  const metadata = validateMetadata(body.metadata)
  const customOrder = body.metadata === undefined
    ? current
    : await service.updateCustomOrderAtomically({
        id: current.id,
        metadata,
        actor: { actor_type: "customer", actor_id: customer.actor_id },
      })

  res.json({ custom_order: customOrder })
}
