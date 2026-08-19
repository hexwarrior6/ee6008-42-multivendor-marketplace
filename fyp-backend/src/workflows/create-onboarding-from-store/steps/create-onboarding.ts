import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { OnboardingService } from "../../../modules/onboarding/service"
import { ONBOARDING_MODULE } from "../../../modules/onboarding"

type CreateOnboardingStepInput = {
    storeId: string
}

export const createOnboardingStep = createStep(
    "create-onboarding",
    async (input: CreateOnboardingStepInput, { container }) => {
        const onboardingModule: OnboardingService = container.resolve(ONBOARDING_MODULE);
        const logger = container.resolve("logger")
        const onboarding = await onboardingModule.createOnboardings({})

        return new StepResponse(onboarding, onboarding)
    },
    async (onboarding, { container }) => {
        if (!onboarding) {
            return
        }

        const onboardingModule: OnboardingService = container.resolve(ONBOARDING_MODULE);
        await onboardingModule.deleteOnboardings(onboarding.id)
    }
)