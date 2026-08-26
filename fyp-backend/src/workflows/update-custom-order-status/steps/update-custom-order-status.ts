import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../modules/custom-order"
import {
  assertCustomOrderTransition,
  type CustomOrderStatus,
} from "../../../modules/custom-order/state-machine"

export type UpdateCustomOrderStatusInput = {
  customOrderId: string
  status: CustomOrderStatus
}

type UpdateCustomOrderStatusCompensation = {
  customOrderId: string
  previousStatus: CustomOrderStatus
}

export const updateCustomOrderStatusStep = createStep(
  "update-custom-order-status",
  async (
    input: UpdateCustomOrderStatusInput,
    { container }
  ) => {
    const service: CustomOrderService = container.resolve(CUSTOM_ORDER_MODULE)
    const current = await service.retrieveCustomOrderRequest(input.customOrderId)
    assertCustomOrderTransition(
      current.status as CustomOrderStatus,
      input.status
    )

    // Keep the compensation type consistent for both the no-op and update
    // paths.  A no-op still records the current status, so a workflow retry
    // can safely run the same rollback handler without special-casing it.
    const compensation: UpdateCustomOrderStatusCompensation = {
      customOrderId: current.id,
      previousStatus: current.status as CustomOrderStatus,
    }

    if (current.status === input.status) {
      return new StepResponse(current, compensation)
    }

    const updated = await service.updateCustomOrderRequests({
      id: current.id,
      status: input.status,
    })

    return new StepResponse(updated, compensation)
  },
  async (
    compensation: UpdateCustomOrderStatusCompensation | undefined,
    { container }
  ) => {
    if (!compensation) {
      return
    }

    const service: CustomOrderService = container.resolve(CUSTOM_ORDER_MODULE)
    await service.updateCustomOrderRequests({
      id: compensation.customOrderId,
      status: compensation.previousStatus,
    })
  }
)
