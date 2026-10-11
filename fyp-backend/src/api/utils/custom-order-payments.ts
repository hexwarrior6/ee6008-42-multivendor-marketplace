import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../modules/custom-order"
import { requireCustomerContext, assertCustomOrderAccess } from "./authz"
import { loadWeChatPayConfig } from "../../modules/wechat-pay/config"

export async function customerPaymentOrder(req: AuthenticatedMedusaRequest) {
  const customer = requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, { allowBackoffice: false })
  return { customer, service, order }
}

export function requireEmptyPaymentBody(body: unknown) {
  if (
    body != null &&
    (typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The payment request body must be empty"
    )
  }
}

export function customPaymentConfig() {
  if (
    process.env.WECHAT_PAY_ENABLED !== "true" &&
    process.env.WECHAT_PAY_SANDBOX !== "true"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "WeChat Pay is not enabled"
    )
  }
  const config = loadWeChatPayConfig()
  if (
    config.mode === "live" &&
    process.env.CUSTOM_ORDER_LIVE_PAYMENTS_ENABLED !== "true"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Live custom-order payments require explicit administrator enablement"
    )
  }
  return config
}

export function paymentLedger(payment: IPaymentModuleService, id: string) {
  return payment.retrievePaymentCollection(id, {
    relations: [
      "payment_sessions",
      "payments",
      "payments.payment_session",
      "payments.captures",
      "payments.refunds",
    ],
  })
}

/** Generic cart checkout must not replace/cancel an owned custom-order session. */
export async function protectCustomPaymentCollection(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  const collection = await payment.retrievePaymentCollection(req.params.id)
  if (collection.metadata?.custom_order_id) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Use the authenticated custom-order payment endpoint"
    )
  }
  next()
}
