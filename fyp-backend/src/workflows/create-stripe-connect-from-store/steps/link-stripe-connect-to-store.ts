import { Link } from "@medusajs/framework/modules-sdk"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { STRIPE_CONNECT_MODULE } from "../../../modules/stripe-connect"
import { Modules } from "@medusajs/framework/utils"

type LinkStripeConnectAccountToStoreInput = {
    storeId: string
    stripeConnectAccountId: string
}

export const linkStripeConnectAccountToStoreStep = createStep(
    "link-stripe-connect-account-to-store",
    async ({storeId, stripeConnectAccountId}: LinkStripeConnectAccountToStoreInput, { container }) => {
        const link: Link = container.resolve("link")
        const logger = container.resolve("logger")

        const linkArray = await link.create({
            [Modules.STORE]: {
                store_id: storeId,
            },
            [STRIPE_CONNECT_MODULE]: {
                payout_account_id: stripeConnectAccountId,
            }
        })
        logger.info(`Linked Stripe Connect Account ${stripeConnectAccountId} to Store ${storeId}`)
        return new StepResponse(linkArray, { storeId, stripeConnectAccountId})
    },
    async ({ storeId, stripeConnectAccountId }: LinkStripeConnectAccountToStoreInput, { container }) => {
        const link: Link = container.resolve("link")

        const linkArray = await link.dismiss({
            [Modules.STORE]: {
                store_id: storeId,
            },
            [STRIPE_CONNECT_MODULE]: {
                payout_account_id: stripeConnectAccountId,
            }
        });
    }
)