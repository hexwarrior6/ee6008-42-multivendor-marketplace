import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveArtisanProfile } from "@lib/data/artisans"
import { retrieveCustomOrder } from "@lib/data/custom-orders"
import CustomOrderDetailTemplate from "@modules/custom-orders/templates/detail-template"

export const metadata: Metadata = {
  title: "Custom order details",
  description: "View a custom order request and its progress.",
}

type Props = {
  params: Promise<{ id: string }>
}

export default async function CustomOrderDetailPage(props: Props) {
  const { id } = await props.params
  const order = await retrieveCustomOrder(id).catch(() => null)

  if (!order) {
    notFound()
  }

  const artisan = await retrieveArtisanProfile(order.artisan_id).catch(
    () => null
  )

  return <CustomOrderDetailTemplate order={order} artisan={artisan} />
}
