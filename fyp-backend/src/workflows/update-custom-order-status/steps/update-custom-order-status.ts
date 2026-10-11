import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
  type CustomOrderMutation,
} from "../../../modules/custom-order"

export type UpdateCustomOrderStatusInput = Omit<CustomOrderMutation, "id"> & {
  customOrderId: string
}

/**
 * The custom-order service owns the transaction, optimistic version check,
 * invariant validation, and status-history write. Keeping the workflow as a
 * thin adapter means every caller gets exactly the same atomic behavior.
 */
export const updateCustomOrderStatusStep = createStep(
  "update-custom-order-status",
  async (input: UpdateCustomOrderStatusInput, { container }) => {
    const service: CustomOrderService = container.resolve(CUSTOM_ORDER_MODULE)
    const updated = await service.updateCustomOrderAtomically({
      ...input,
      id: input.customOrderId,
    })
    return new StepResponse(updated)
  }
)
