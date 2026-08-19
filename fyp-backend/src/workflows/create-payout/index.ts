import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { calculateStripeFeeStep } from "./steps/calculate-stripe-fee"
import storePayoutAccountLink from "../../links/store-payout"
import { linkOrderToPayoutStep } from "./steps/link-order-to-payout"
import { createPayoutStep } from "./steps/create-payout"
import { logger } from "@medusajs/framework"
import { getSmallestUnit } from "../../modules/stripe-connect/util/money"

type WorkflowInput = {
    orderId: string
}

const createPayoutWorkflow = createWorkflow(
  "create-payout",
  function (input: WorkflowInput) {
    
    const { data: orders } = useQueryGraphStep({
        entity: "order",
        fields: ["stores.id", "total", "currency_code"],
        filters: {
            id: input.orderId,
        },
        options: { throwIfKeyNotFound: true },
    }).config({name: "query-orders"})

    //@ts-ignore
    const order = transform(orders, (orders) => {
      const transformed = orders[0]

      logger.info(`Order data in workflow: ${JSON.stringify(transformed)}`)

      return {
        seller_id: transformed.stores?.[0]?.id,
        id: transformed.id,
        total: transformed.total,
        currency_code: transformed.currency_code
      }
    })
    

    const { data: stores } = useQueryGraphStep({
        entity: storePayoutAccountLink.entryPoint,
        fields: ["payout_account.*",],
        filters: {
            store_id: order.seller_id,
        }
    }).config({name: "query-stores"})

    const payoutAccount = transform(stores, (stores) => {
      logger.info(`Store payout account data: ${JSON.stringify(stores)}`)
      return stores[0].payout_account
    })

    const fees = calculateStripeFeeStep({orderId: input.orderId})
    const orderSmallestCurrency = transform({ order }, (data) => {
      const currency = data.order.currency_code
      const amount = getSmallestUnit(data.order.total, currency)
      logger.info(`Order total in smallest currency unit: ${amount} ${currency}`)
      return amount
    })

    const payout_amount = transform(
      { orderSmallestCurrency, fees },
      (data) => {
        return data.orderSmallestCurrency - (2 * data.fees.fee)
      }
    )
    //Create Payout
    const payoutData = transform({ payoutAccount, order }, (data) => {
      logger.info(`Store data: ${JSON.stringify(data.payoutAccount)}`)
      if (!data.payoutAccount) {
        throw new Error(`No payout account found for store ID: ${data.order.seller_id}`)
      }
      return {
        payout_account_id: data.payoutAccount.id, // Database ID
        stripe_connect_id: data.payoutAccount.stripe_connect_id // Stripe ID
      }
    })
    
    const transferInput = transform(
      { payoutData, payout_amount, order },
      (data) => ({
        payout_account_id: data.payoutData.payout_account_id,
        stripe_connect_id: data.payoutData.stripe_connect_id,
        amount: data.payout_amount,
        currency_code: data.order.currency_code,
      })
    )
    const transfer = createPayoutStep(transferInput)
    
    //LINK ORDER TO PAYOUT STEP HERE
    const orderPayoutLinkArray = linkOrderToPayoutStep({
          orderId: order.id,
          payoutId: transfer.id,
        })
    
    return new WorkflowResponse("Done!")
  }
)

export default createPayoutWorkflow