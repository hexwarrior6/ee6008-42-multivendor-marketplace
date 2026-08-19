import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createOnboardingStep } from "./steps/create-onboarding"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { ONBOARDING_MODULE } from "../../modules/onboarding"
import { Modules } from "@medusajs/framework/utils"
import { link } from "fs"
import { linkOnboardingToStoreStep } from "./steps/link-onboarding-to-store"

export type CreateOnboardingFromStoreWorkflowInput = {
    storeId: string
}

const createOnboardingFromStoreWorkflow = createWorkflow(
  "create-onboarding-from-store",
  function (input: CreateOnboardingFromStoreWorkflowInput) {
    const onboarding = createOnboardingStep({
        storeId: input.storeId,
    })
    
    const onboardingStoreLinkArray = linkOnboardingToStoreStep({
      onboardingId: onboarding.id,
      storeId: input.storeId,
    })
    return new WorkflowResponse("Done!")
  }
)

export default createOnboardingFromStoreWorkflow