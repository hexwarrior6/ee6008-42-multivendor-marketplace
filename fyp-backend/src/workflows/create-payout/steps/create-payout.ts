import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { STRIPE_CONNECT_MODULE } from "../../../modules/stripe-connect"
import type { CreateTransferDTO, StripeConnectModuleService } from "../../../modules/stripe-connect/service"


//Create payout and return payout id
export const createPayoutStep = createStep(
    "create-payout",
    async (input: CreateTransferDTO, { container }) => {

        const stripeConnectModuleService = container.resolve<StripeConnectModuleService>(STRIPE_CONNECT_MODULE)

        const transferObject = await stripeConnectModuleService.createTransfer(input)

        
        
        return new StepResponse(transferObject)
    }
)
