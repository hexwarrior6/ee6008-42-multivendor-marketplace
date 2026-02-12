import { OrderDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/medusa"
import createPayoutWorkflow from "../workflows/create-payout"
import sendOrderDeliveredworkflow from "../workflows/send-order-delivered"

export default async function fulfilmentDelivered({
    event,
    container,
}: SubscriberArgs<{ id: string}>) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    logger.info(`Received fulfilment delivered event for fulfilment ID: ${event.data.id}`)

    const { data: fulfilment } = await query.graph({
        entity: "fulfillment",
        fields: ["order.*"],
        filters: {
            id: event.data.id,
        }
    })
    const order = fulfilment[0].order
    if (!order) {
        logger.info(`No order found for fulfilment ID: ${event.data.id}`)
        return
    }
    logger.info(`Fulfilment delivered for order ID: ${order.id}`)

    //Trigger payout workflow
    const { result } = await createPayoutWorkflow(container).run({
        input: {
            orderId: order.id,
        }
    })

    // Send Email
    await sendOrderDeliveredworkflow(container).run({
        input: {
            id: order.id,
        }
    })
    
}

export const config: SubscriberConfig = {
    event: "delivery.created",
}