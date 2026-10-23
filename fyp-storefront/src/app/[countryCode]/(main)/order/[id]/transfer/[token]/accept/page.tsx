import { acceptTransferRequest } from "@lib/data/orders"
import { Heading, Text } from "@medusajs/ui"
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

  const { success, error } = await acceptTransferRequest(id, token)

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        {success && (
          <>
            <Heading level="h1" className="text-xl text-zinc-900">
              {t.transferAcceptedTitle}
            </Heading>
            <Text className="text-zinc-600">
              {t.transferAcceptedBody.replace("{id}", id)}
            </Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-zinc-600">{t.transferAcceptError}</Text>
            {error && (
              <Text className="text-red-500">
                {t.transferErrorPrefix} {error}
              </Text>
            )}
          </>
        )}
      </div>
    </div>
  )
}
