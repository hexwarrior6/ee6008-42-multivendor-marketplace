import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  updateCustomOrderStatusStep,
  type UpdateCustomOrderStatusInput,
} from "./steps/update-custom-order-status"

const updateCustomOrderStatusWorkflow = createWorkflow(
  "update-custom-order-status",
  (input: UpdateCustomOrderStatusInput) => {
    const customOrder = updateCustomOrderStatusStep(input)
    return new WorkflowResponse(customOrder)
  }
)

export default updateCustomOrderStatusWorkflow
