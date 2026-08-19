import { createStep, StepResponse, transform } from "@medusajs/framework/workflows-sdk"
import { z } from "@medusajs/framework/zod"
import { ONBOARDING_MODULE } from "../../../modules/onboarding"
import { OnboardingService } from "../../../modules/onboarding/service"
import storePayoutAccountLink from "../../../links/store-payout"

type recalculateOnboardingInput = {
    storeId: string
}

export const recalculateOnboardingStep = createStep(
    "recalculate-onboarding",
    async (input: recalculateOnboardingInput, { container }) => {
        const query = container.resolve("query")

        const { data: store } = await query.graph({
            entity: "store",
            fields: ["*"],
            filters: { "id": input.storeId },
        })
        
        const { success: store_information } = z.object({
            name: z.string().min(1),
            default_sales_channel_id: z.string(),
            default_region_id: z.string(),
            default_location_id: z.string(),
        }).safeParse(store[0])

        const { data: location } = await query.graph({
            entity: "stock_location_store",
            fields: ["id"],
            filters: { "store_id": input.storeId },
        })
        
        const location_shipping = !!location?.length

        // Placeholder for Stripe Connect check
        const { data: payoutAccount } = await query.graph({
            entity: storePayoutAccountLink.entryPoint,
            fields: ["payout_account.*"],
            filters: { "store_id": input.storeId },
        })
        const stripe_connect = payoutAccount[0]?.payout_account?.status === "active"

        const { data: onboardingInfo } = await query.graph({
            entity: "store",
            fields: ["onboarding.*"],
            filters: { "id": input.storeId },
        })


        const toUpdate = {
            store_information: store_information,
            locations_shipping: location_shipping,
            stripe_connect: stripe_connect
        }
        const onboarding: OnboardingService = container.resolve(ONBOARDING_MODULE)

        const updatedOnboarding = await onboarding.updateOnboardings({
            ...toUpdate,
            id: onboardingInfo[0].onboarding?.id
        })

        return new StepResponse(updatedOnboarding)
    }
)