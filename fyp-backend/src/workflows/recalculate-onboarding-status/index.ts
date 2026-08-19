import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { recalculateOnboardingStep } from "./steps/recalculate-onboarding"

type RecalculateOnboardingInput = {
    storeId: string
}

const recalculateOnboardingWorkflow = createWorkflow(
  "workflow-name",
  function (input: RecalculateOnboardingInput) {
    const result = recalculateOnboardingStep({ storeId: input.storeId })
    
    return new WorkflowResponse(result)
  }
)

export default recalculateOnboardingWorkflow