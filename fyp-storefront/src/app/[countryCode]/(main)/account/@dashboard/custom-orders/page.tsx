import { Metadata } from "next"

import { listCustomOrders } from "@lib/data/custom-orders"
import CustomOrderOverview from "@modules/custom-orders/components/custom-order-overview"

export const metadata: Metadata = {
  title: "Custom orders",
  description: "Track your custom order requests.",
}

export default async function CustomOrdersPage() {
  const orders = await listCustomOrders()

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl-semi">Custom orders</h1>
        <p className="text-base-regular mt-3">
          Review your requests, quotes, and production progress.
        </p>
      </div>
      <CustomOrderOverview orders={orders} />
    </div>
  )
}
