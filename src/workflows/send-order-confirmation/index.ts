import {
  createWorkflow,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep, useQueryGraphStep } from "@medusajs/medusa/core-flows"

type WorkflowInput = {
    id: string
}

const sendOrderConfirmationworkflow = createWorkflow(
  "send-order-confirmation",
  function ({ id }: WorkflowInput) {
    const { data: orders } = useQueryGraphStep({
        entity: "order",
        fields: [
            "id",
            "display_id",
            "email",
            "currency_code",
            "total",
            "items.*",
            "shipping_address.*",
            "billing_address.*",
            "shipping_methods.*",
            "customer.*",
            "total",
            "subtotal",
            "discount_total",
            "shipping_total",
            "tax_total",
            "item_total",
            "item_subtotal",
            "item_tax_total",
        ],
        filters: {
            id,
        },
        options: {
            throwIfKeyNotFound: true,
        },
    })
    //@ts-ignore
    const notification = when({ orders }, (data) => !!data.orders[0].email).then(() => {
        return sendNotificationsStep([{
            to: orders[0].email!,
            channel: "email",
            template: "order_placed",
            data: {
                order: orders[0],
            },
        }])
    })
    
    return new WorkflowResponse({notification})
  }
)

export default sendOrderConfirmationworkflow