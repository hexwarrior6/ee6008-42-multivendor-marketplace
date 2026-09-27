import { Heading, Text } from "@medusajs/ui"
import TransferActions from "@modules/order/components/transfer-actions"
import TransferImage from "@modules/order/components/transfer-image"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export default async function TransferPage({
  params,
}: {
  params: { id: string; token: string }
}) {
  const { id, token } = params
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).order

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        <Heading level="h1" className="text-xl text-zinc-900">
          {t.transferRequestTitle.replace("{id}", id)}
        </Heading>
        <Text className="text-zinc-600">
          {t.transferInviteBody.replace("{id}", id)}
        </Text>
        <div className="w-full h-px bg-zinc-200" />
        <Text className="text-zinc-600">{t.transferResponsibilityBody}</Text>
        <Text className="text-zinc-600">{t.transferNoActionBody}</Text>
        <div className="w-full h-px bg-zinc-200" />
        <TransferActions id={id} token={token} />
      </div>
    </div>
  )
}
