import { Button, Heading, Text } from "@medusajs/ui"

import type { CustomOrder } from "@lib/data/custom-orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CustomOrderCard from "@modules/custom-orders/components/custom-order-card"

export default function CustomOrderOverview({
  orders,
}: {
  orders: CustomOrder[]
}) {
  if (!orders.length) {
    return (
      <div className="border border-ui-border-base p-8 text-center">
        <Heading level="h2" className="text-lg">
          No custom requests yet
        </Heading>
        <Text className="text-ui-fg-muted mt-2 mb-5">
          Visit an artisan profile to start a personalised project.
        </Text>
        <LocalizedClientLink href="/store">
          <Button variant="secondary">Browse products</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <CustomOrderCard key={order.id} order={order} />
      ))}
    </div>
  )
}
