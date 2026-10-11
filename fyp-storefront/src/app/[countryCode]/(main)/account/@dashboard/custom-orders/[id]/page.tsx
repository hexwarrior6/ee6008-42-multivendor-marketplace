import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveArtisanProfile } from "@lib/data/artisans"
import {
  retrieveCustomOrder,
  retrieveCustomOrderTalkJsSession,
} from "@lib/data/custom-orders"
import CustomOrderDetailTemplate from "@modules/custom-orders/templates/detail-template"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"
import { getStorefrontDictionary } from "@lib/i18n/storefront"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).customOrder

  return {
    title: t.customOrder,
    description: t.listIntro,
  }
}

type Props = {
  params: Promise<{ countryCode: string; id: string }>
}

export default async function CustomOrderDetailPage(props: Props) {
  const { id } = await props.params
  const order = await retrieveCustomOrder(id).catch(() => null)

  if (!order) {
    notFound()
  }

  const [artisan, talkJsSession, locale] = await Promise.all([
    retrieveArtisanProfile(order.artisan_id).catch(() => null),
    // Chat is an enhancement of the order detail page: if TalkJS is not
    // configured or temporarily unreachable, the order and its status must
    // still be shown with a degraded messages section.
    retrieveCustomOrderTalkJsSession(order.id).catch(() => null),
    getStorefrontLocale(),
  ])

  return (
    <CustomOrderDetailTemplate
      order={order}
      artisan={artisan}
      talkJsSession={talkJsSession}
      locale={locale}
    />
  )
}
