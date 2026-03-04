import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

type OrderCompleteStepInput = {
    order_id: string
}

export const orderCompleteStep = createStep(
    "order-complete",
    async (input: OrderCompleteStepInput, { container }) => {
        const orderModule = container.resolve(Modules.ORDER)
        
        const order = await orderModule.updateOrders(input.order_id, {
            status: "completed",
        })

        
        return new StepResponse(order)
    }
)