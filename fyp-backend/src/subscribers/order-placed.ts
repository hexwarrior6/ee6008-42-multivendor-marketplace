import type { SubscriberConfig, SubscriberArgs } from "@medusajs/medusa"
import sendOrderConfirmationworkflow from "../workflows/send-order-confirmation"

type EventData = { id: string }

export default async function storeOrderPlacedHandler({
    event: { data },
    container,
}: SubscriberArgs<EventData>) {
    await sendOrderConfirmationworkflow(container).run({
        input: {
            id: data.id,
        }
    })
    
}

export const config: SubscriberConfig = {
    event: "order.placed",
}