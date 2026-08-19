import { Link } from "@medusajs/framework/modules-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { STRIPE_CONNECT_MODULE } from "../../../modules/stripe-connect"

type LinkOrderToPayoutStepInput = {
    orderId: string
    payoutId: string
}

export const linkOrderToPayoutStep = createStep(
    "link-order-to-payout",
    async ({orderId, payoutId }: LinkOrderToPayoutStepInput, { container }) => {
        
        const link: Link = container.resolve(ContainerRegistrationKeys.LINK)
        const logger = container.resolve("logger")

        const linkArray = await link.create({
            [Modules.ORDER]: {
                order_id: orderId,
            },
            [STRIPE_CONNECT_MODULE]: {
                payout_id: payoutId,
            }
            
        });
        logger.info(`Linked order ${orderId} to payout ${payoutId}`)
        return new StepResponse(linkArray, { orderId, payoutId })
    },
    async ({ orderId, payoutId }: LinkOrderToPayoutStepInput, { container }) => {
        const link: Link = container.resolve(ContainerRegistrationKeys.LINK)

        const linkArray = await link.dismiss({
            [Modules.ORDER]: {
                order_id: orderId,
            },
            [STRIPE_CONNECT_MODULE]: {
                payout_id: payoutId,
            }
        });
    }
)