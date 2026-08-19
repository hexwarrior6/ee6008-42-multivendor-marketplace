import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse, transform } from "@medusajs/framework/workflows-sdk"
import Stripe from "stripe"
import { STRIPE_CONNECT_MODULE } from "../../../modules/stripe-connect"

type StepInput = {
    orderId: string
}

export const calculateStripeFeeStep = createStep(
    "calculate-stripe-fee-step",
    async (input: StepInput, { container }) => {

        const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const stripeConnectModuleService = container.resolve(STRIPE_CONNECT_MODULE)

        const { data: paymentInfo } = await query.graph({
            entity: "order",
            fields: ["payment_collections.payment_sessions.data"],
            filters: {
                id: input.orderId
            }
        })
        
        // Extract payment intent ID from payment session data
        const paymentIntentId = paymentInfo[0]?.payment_collections?.[0]?.payment_sessions?.[0]?.data?.id as string
        
        if (!paymentIntentId) {
            throw new Error("Payment intent ID not found in payment session")
        }

        logger.info(`Retrieved payment intent ID: ${paymentIntentId}`)
        
        const fees = await stripeConnectModuleService.getStripeFees(paymentIntentId)

        
        return new StepResponse(fees)
    }
)