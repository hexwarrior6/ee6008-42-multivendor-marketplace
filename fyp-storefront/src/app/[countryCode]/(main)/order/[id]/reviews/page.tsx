import { retrieveOrder } from "@lib/data/orders"
import { getProductReviews } from "@lib/data/products"
import OrderReviewTemplate from "@modules/order/templates/order-review-template"
import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

type Props = {
  params: Promise<{ id: string }>
}
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).order

  return {
    title: t.reviewMetadataTitle,
    description: t.reviewMetadataDescription,
  }
}

export default async function OrderConfirmedPage(props: Props) {
  const params = await props.params
  const order = await retrieveOrder(params.id).catch(() => null)

  if (!order) {
    return notFound()
  }

  return <OrderReviewTemplate order={order} />
}
