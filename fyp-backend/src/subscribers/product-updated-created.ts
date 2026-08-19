import type { SubscriberConfig, SubscriberArgs } from "@medusajs/medusa"

type EventData = { id: string }

export default async function productCreatedUpdatedHandler({
    event: { data },
    container,
}: SubscriberArgs<EventData>) {
    await fetch(`${process.env.STORE_CORS}/api/revalidate?tags=products`)
}

export const config: SubscriberConfig = {
    event: ["product.created", "product.updated", "product-variant.updated"],
}