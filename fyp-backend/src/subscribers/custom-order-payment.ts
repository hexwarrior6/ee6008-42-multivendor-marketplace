import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import { Modules, PaymentEvents } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../modules/custom-order"
import {
  customPaymentConfig,
  paymentLedger,
} from "../api/utils/custom-order-payments"

export default async function customOrderPayment({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const payment: IPaymentModuleService = container.resolve(Modules.PAYMENT)
  const record = await payment.retrievePayment(event.data.id)
  const collection = await payment.retrievePaymentCollection(
    record.payment_collection_id
  )
  const orderId = collection.metadata?.custom_order_id
  if (typeof orderId !== "string") return
  const service: CustomOrderService = container.resolve(CUSTOM_ORDER_MODULE)
  let config
  try {
    config = customPaymentConfig()
  } catch {
    /* refuse live verification when disabled/misconfigured */
  }
  await service.reconcilePaymentCollection(
    orderId,
    (id) => paymentLedger(payment, id),
    config
  )
}

export const config: SubscriberConfig = {
  event: [PaymentEvents.CAPTURED, PaymentEvents.REFUNDED],
}
