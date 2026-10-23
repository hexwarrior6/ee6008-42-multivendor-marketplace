import { Heading, Text } from "@medusajs/ui"

import InteractiveLink from "@modules/common/components/interactive-link"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

const EmptyCartMessage = async () => {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).cart

  return (
    <div
      className="py-48 px-2 flex flex-col justify-center items-start"
      data-testid="empty-cart-message"
    >
      <Heading
        level="h1"
        className="flex flex-row text-3xl-regular gap-x-2 items-baseline"
      >
        {t.emptyTitle}
      </Heading>
      <Text className="text-base-regular mt-4 mb-6 max-w-[32rem]">
        {t.emptyBody}
      </Text>
      <div>
        <InteractiveLink href="/store">{t.browseProducts}</InteractiveLink>
      </div>
    </div>
  )
}

export default EmptyCartMessage
