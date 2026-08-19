import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { listShippingOptionsForCartWorkflow } from "@medusajs/medusa/core-flows"
import { filterSellerShippingOptionsStep } from "./step/filter-seller-shipping-options"


const myWorkflow = createWorkflow(
  "list-seller-shipping-options-for-cart",
  function (input: { cart_id: string; is_return: boolean }) {
    
    const shipping_options = listShippingOptionsForCartWorkflow.runAsStep({ input })

    const cartFilteredPayload = transform(
        {shipping_options, input}, ({shipping_options, input}) => ({
            shipping_options,
            cart_id: input.cart_id,
        })
    )
    
    return new WorkflowResponse(filterSellerShippingOptionsStep(cartFilteredPayload))
  }
)

export default myWorkflow