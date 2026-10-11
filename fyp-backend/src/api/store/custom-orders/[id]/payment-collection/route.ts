import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import {
  MedusaError,
  Modules,
  MathBN,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../../../../modules/custom-order"
import {
  assertPaymentPreparation,
  customOrderPaymentAmount,
  paymentCollectionId,
  type PaymentOrderSnapshot,
} from "../../../../../modules/custom-order/payment"
import {
  assertCustomOrderAccess,
  requireCustomerContext,
} from "../../../../utils/authz"

async function authorizedOrder(req: AuthenticatedMedusaRequest) {
  const customer = requireCustomerContext(req)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const order = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, { allowBackoffice: false })
  return { service, order, customer }
}

async function summary(
  payment: IPaymentModuleService,
  order: PaymentOrderSnapshot
) {
  const collectionId = paymentCollectionId(order)
  if (!collectionId) return null
  const collection = await payment.retrievePaymentCollection(collectionId)
  if (
    collection.currency_code !== order.currency_code ||
    !MathBN.eq(
      collection.amount,
      customOrderPaymentAmount(order.quoted_amount, order.currency_code)
    ) ||
    collection.metadata?.custom_order_id !== order.id
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Payment collection does not match the accepted quote"
    )
  }
  // Deliberately exclude provider payloads, credentials, metadata and customer details.
  return {
    id: collection.id,
    currency_code: collection.currency_code,
    amount: Number(collection.amount),
    status: collection.status,
    authorized_amount: Number(collection.authorized_amount ?? 0),
    captured_amount: Number(collection.captured_amount ?? 0),
    refunded_amount: Number(collection.refunded_amount ?? 0),
    verification: "unverified" as const,
  }
}

async function discardUnusedCollection(
  req: AuthenticatedMedusaRequest,
  payment: IPaymentModuleService,
  id: string
) {
  const collection = await payment.retrievePaymentCollection(id, {
    relations: ["payment_sessions", "payments"],
  })
  if (
    !Array.isArray(collection.payment_sessions) ||
    !Array.isArray(collection.payments) ||
    collection.payment_sessions.length ||
    collection.payments.length ||
    !MathBN.eq(collection.authorized_amount ?? 0, 0) ||
    !MathBN.eq(collection.captured_amount ?? 0, 0) ||
    !MathBN.eq(collection.refunded_amount ?? 0, 0)
  ) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        "Unused custom-order collection contains payment activity; automatic deletion refused"
      )
    return
  }
  await payment.deletePaymentCollections(id)
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { order } = await authorizedOrder(req)
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  res.json({
    payment_collection: await summary(payment, order),
    payment_status: order.payment_status,
  })
}

/** Prepare only: this never creates a provider session, authorizes or captures funds. */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { service, order, customer } = await authorizedOrder(req)
  if (
    req.body !== undefined &&
    req.body !== null &&
    (typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The payment preparation body must be empty"
    )
  }
  const amount = assertPaymentPreparation(order, customer.actor_id)
  const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
  if (paymentCollectionId(order)) {
    res.json({
      payment_collection: await summary(payment, order),
      payment_status: order.payment_status,
    })
    return
  }
  const collection = await payment.createPaymentCollections({
    currency_code: order.currency_code,
    amount,
    metadata: { custom_order_id: order.id },
  })
  let bound: PaymentOrderSnapshot
  try {
    bound = await service.bindPaymentCollection({
      id: order.id,
      customer_id: customer.actor_id,
      collection_id: collection.id,
      version: order.version,
    })
  } catch (error) {
    // A lost commit response is ambiguous: check durable binding before cleanup.
    try {
      const latest = await service.retrieveCustomOrderRequest(order.id)
      if (paymentCollectionId(latest) !== collection.id) {
        await discardUnusedCollection(req, payment, collection.id)
      }
    } catch {
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          "Custom-order payment preparation needs reconciliation; no ambiguous collection was deleted"
        )
    }
    throw error
  }
  if (paymentCollectionId(bound) !== collection.id) {
    // Concurrent requests return the winning binding; remove only our unused collection.
    await discardUnusedCollection(req, payment, collection.id)
  }
  res.json({
    payment_collection: await summary(payment, bound),
    payment_status: bound.payment_status,
  })
}
