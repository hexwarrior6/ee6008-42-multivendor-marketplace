import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createStripeConnectAccountStep } from "./steps/create-stripe-connect"
import { linkStripeConnectAccountToStoreStep } from "./steps/link-stripe-connect-to-store"

type createStripeConnectAccountWorkflowInput = {
    storeId: string
}

const myWorkflow = createWorkflow(
  "create-stripe-connect-account-workflow",
  function (input: createStripeConnectAccountWorkflowInput) {
    const stripeConnectAccount = createStripeConnectAccountStep({
        storeId: input.storeId,
    })

    const stripeConnectAccountStoreLinkArray = linkStripeConnectAccountToStoreStep({
      storeId: input.storeId,
      stripeConnectAccountId: stripeConnectAccount.id,
    })
    
    return new WorkflowResponse("Done!")
  }
)

export default myWorkflow