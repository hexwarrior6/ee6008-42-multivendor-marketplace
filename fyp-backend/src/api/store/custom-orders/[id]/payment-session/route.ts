import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import { Modules, MedusaError, MathBN } from "@medusajs/framework/utils"
import {
  assertPaymentCollectionMatches,
  paymentCollectionId,
  customOrderPaymentAmount,
  CUSTOM_WECHAT_PROVIDER,
} from "../../../../../modules/custom-order/payment"
import {
  customerPaymentOrder,
  customPaymentConfig,
  requireEmptyPaymentBody,
} from "../../../../utils/custom-order-payments"

/** Read-only preflight prevents binding an order when no payment provider is available. */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { order } = await customerPaymentOrder(req)
  const config = customPaymentConfig()
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  const providers = await payment.listPaymentProviders({
    id: CUSTOM_WECHAT_PROVIDER,
  })
  if (order.currency_code !== "cny" || !providers.some((p) => p.is_enabled)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Custom WeChat payment is not available"
    )
  }
  res.json({ enabled: true, mode: config.mode, currency_code: "cny" })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { customer, service } = await customerPaymentOrder(req)
  requireEmptyPaymentBody(req.body)
  const config = customPaymentConfig()
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  const result = await service.withLockedPaymentOrder(
    req.params.id,
    customer.actor_id,
    async (order) => {
      if (order.currency_code !== "cny")
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Custom WeChat payments require CNY"
        )
      const collectionId = paymentCollectionId(order)!
      const collection = await payment.retrievePaymentCollection(collectionId, {
        relations: ["payment_sessions", "payments"],
      })
      assertPaymentCollectionMatches(order, collection)
      if (collection.payments?.length)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "A payment already exists; refresh payment status"
        )
      const sessions = collection.payment_sessions ?? []
      if (sessions.length > 1)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Multiple payment sessions require administrator review"
        )
      const session =
        sessions[0] ??
        (await payment.createPaymentSession(collectionId, {
          provider_id: CUSTOM_WECHAT_PROVIDER,
          amount: customOrderPaymentAmount(
            order.quoted_amount,
            order.currency_code
          ),
          currency_code: order.currency_code,
          data: { description: `Custom order ${order.id}` },
        }))
      if (
        session.provider_id !== CUSTOM_WECHAT_PROVIDER ||
        session.currency_code !== "cny" ||
        !MathBN.eq(
          session.amount,
          customOrderPaymentAmount(order.quoted_amount, order.currency_code)
        ) ||
        Number(session.data?.amount_fen) !== order.quoted_amount ||
        session.data?.mock !== (config.mode === "mock") ||
        !["pending", "requires_more"].includes(session.status)
      ) {
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Existing session cannot be reused; refresh or contact an administrator"
        )
      }
      const codeUrl = session.data?.code_url
      if (
        typeof codeUrl !== "string" ||
        codeUrl.length > 2048 ||
        !/^weixin:\/\/wxpay\/bizpayurl\/up\?pr=[a-zA-Z0-9_%=-]+$/.test(codeUrl)
      ) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Payment provider did not return a valid WeChat payment URL"
        )
      }
      return {
        id: session.id,
        provider_id: session.provider_id,
        status: session.status,
        code_url: codeUrl,
        mode: config.mode,
        amount: customOrderPaymentAmount(
          order.quoted_amount,
          order.currency_code
        ),
        currency_code: order.currency_code,
      }
    }
  )
  res.json({ payment_session: result })
}
