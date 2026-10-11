import type { PaymentCollectionDTO } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"
import type { WeChatPayConfig } from "../wechat-pay/config"
import { verifyCustomOrderPayment, type PaymentOrderSnapshot } from "./payment"

/** Verified, unrefunded capture snapshot; review records are EXCLUDED, not zero-valued sales. */
export function aggregateCustomPayments(
  rows: Array<{
    order: PaymentOrderSnapshot
    collection?: PaymentCollectionDTO
  }>,
  config?: Pick<WeChatPayConfig, "mode" | "appId" | "merchantId">
) {
  let revenue = MathBN.convert(0)
  let verifiedOrders = 0,
    simulatedOrders = 0,
    unverifiedOrders = 0,
    reviewOrders = 0
  for (const { order, collection } of rows) {
    if (!collection) {
      unverifiedOrders++
      continue
    }
    try {
      const proof = verifyCustomOrderPayment(order, collection, config)
      if (proof.verification === "verified") {
        revenue = MathBN.add(revenue, collection.captured_amount ?? 0)
        verifiedOrders++
      } else if (proof.verification === "simulated") simulatedOrders++
      else if (proof.verification === "review_required") reviewOrders++
      else unverifiedOrders++
    } catch {
      reviewOrders++
    }
  }
  return {
    verified_capture_amount: revenue.toNumber(),
    verified_orders: verifiedOrders,
    simulated_orders: simulatedOrders,
    unverified_orders: unverifiedOrders,
    review_required_orders: reviewOrders,
    excluded_orders: simulatedOrders + unverifiedOrders + reviewOrders,
  }
}
