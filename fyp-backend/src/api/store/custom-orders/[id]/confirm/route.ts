import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../../modules/custom-order"
import { MAX_CUSTOM_ORDER_AMOUNT } from "../../../../../modules/custom-order/constants"
import {
  assertCustomOrderAccess,
  requireCustomerContext,
} from "../../../../utils/authz"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const current = await service.retrieveCustomOrderRequest(req.params.id)
  const actor = await assertCustomOrderAccess(req, current, {
    allowBackoffice: false,
  })
  const body = req.body as Record<string, unknown> | undefined
  if (
    !body ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !["version", "quoted_amount", "currency_code"].includes(key)
    ) ||
    !Number.isSafeInteger(body.version) ||
    Number(body.version) < 0 ||
    !Number.isInteger(body.quoted_amount) ||
    Number(body.quoted_amount) <= 0 ||
    Number(body.quoted_amount) > MAX_CUSTOM_ORDER_AMOUNT ||
    typeof body.currency_code !== "string" ||
    !/^[a-z]{3}$/.test(body.currency_code)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "version, positive quoted_amount and currency_code are required; other fields are not allowed"
    )
  }
  const updated = await service.updateCustomOrderAtomically({
    id: current.id,
    status: "confirmed",
    actor,
    customer_confirmation: {
      version: Number(body.version),
      quoted_amount: Number(body.quoted_amount),
      currency_code: body.currency_code,
    },
    reason: "Customer accepted the quote",
  })
  res.json({ custom_order: updated })
}
