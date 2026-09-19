import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveArtisanProfile } from "@lib/data/artisans"
import {
  listCustomOrderMessages,
  retrieveCustomOrder,
} from "@lib/data/custom-orders"
import CustomOrderDetailTemplate from "@modules/custom-orders/templates/detail-template"

export const metadata: Metadata = {
  title: "Custom order details",
  description: "View a custom order request and its progress.",
}

type Props = {
  params: Promise<{ countryCode: string; id: string }>
}

export default async function CustomOrderDetailPage(props: Props) {
  const { countryCode, id } = await props.params
  const order = await retrieveCustomOrder(id).catch(() => null)

  if (!order) {
    notFound()
  }

  const [artisan, messages] = await Promise.all([
    retrieveArtisanProfile(order.artisan_id).catch(() => null),
    listCustomOrderMessages(order.id),
  ])

  return (
    <CustomOrderDetailTemplate
      order={order}
      artisan={artisan}
      messages={messages}
      countryCode={countryCode}
    />
  )
}
