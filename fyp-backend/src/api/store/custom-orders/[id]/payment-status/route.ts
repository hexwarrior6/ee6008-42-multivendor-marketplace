import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  customerPaymentOrder,
  customPaymentConfig,
  paymentLedger,
  requireEmptyPaymentBody,
} from "../../../../utils/custom-order-payments"

/** POST because reconciling a trusted ledger may update the order; never charges. */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { service } = await customerPaymentOrder(req)
  requireEmptyPaymentBody(req.body)
  let config
  try {
    config = customPaymentConfig()
  } catch {
    /* fail closed: no live receipt is accepted */
  }
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  const result = await service.reconcilePaymentCollection(
    req.params.id,
    (id) => paymentLedger(payment, id),
    config
  )
  res.json({
    payment_status: result.custom_order.payment_status,
    verification: result.verification,
  })
}
