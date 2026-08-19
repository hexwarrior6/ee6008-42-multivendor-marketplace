
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { STRIPE_CONNECT_MODULE } from "../../../modules/stripe-connect"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type createStripeConnectAccountInput = {
    storeId: string
}

export const createStripeConnectAccountStep = createStep({name: "create-stripe-connect-account", /*async=true*/ },
    async (input: createStripeConnectAccountInput, { container }) => {
        const stripeConnectService = container.resolve(STRIPE_CONNECT_MODULE)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        const {data: store } = await query.graph({
            entity: "store",
            fields: ["*"],
            filters: { id: input.storeId },
        })

        const stripeConnectAccount = await stripeConnectService.createStripeAccount(
            input.storeId,
            store[0].name
        )
        return new StepResponse(stripeConnectAccount)
    },
    //TO DO: COMPENSATE FN
)