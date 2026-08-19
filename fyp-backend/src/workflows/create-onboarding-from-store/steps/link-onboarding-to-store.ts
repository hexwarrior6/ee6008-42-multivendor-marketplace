import { Link } from "@medusajs/framework/modules-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ONBOARDING_MODULE } from "../../../modules/onboarding"

type LinkOnboardingToStoreStepInput = {
    onboardingId: string
    storeId: string
}

export const linkOnboardingToStoreStep = createStep(
    "link-onboarding-to-store",
    async ({onboardingId, storeId }: LinkOnboardingToStoreStepInput, { container }) => {
        
        const link: Link = container.resolve(ContainerRegistrationKeys.LINK)
        const logger = container.resolve("logger")

        const linkArray = await link.create({
            [Modules.STORE]: {
                store_id: storeId,
            },
            [ONBOARDING_MODULE]: {
                onboarding_id: onboardingId,
            }
            
        });
        logger.info(`Linked onboarding ${onboardingId} to store ${storeId}`)
        return new StepResponse(linkArray, { onboardingId, storeId })
    },
    async ({ onboardingId, storeId }: LinkOnboardingToStoreStepInput, { container }) => {
        const link: Link = container.resolve(ContainerRegistrationKeys.LINK)

        const linkArray = await link.dismiss({
            [Modules.STORE]: {
                store_id: storeId,
            },
            [ONBOARDING_MODULE]: {
                onboarding_id: onboardingId,
            }
        });
    }
)