import { retrieveOrder } from "@lib/data/orders"
import { getProductReviews } from "@lib/data/products"
import OrderReviewTemplate from "@modules/order/templates/order-review-template"
import { Metadata } from "next"
import { notFound } from "next/navigation"

type Props = {
  params: Promise<{ id: string }>
}
export const metadata: Metadata = {
  title: "Reviews",
  description: "What did you think of your order?",
}

export default async function OrderConfirmedPage(props: Props) {
  const params = await props.params
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    return notFound()
  }

  const fulfilledItems = order.items || [];
  return <OrderReviewTemplate order={order} />
}
