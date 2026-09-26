import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export const metadata: Metadata = {
  title: "404",
  description: "Something went wrong",
}

export default async function NotFound() {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).shell

  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">{t.notFoundTitle}</h1>
      <p className="text-small-regular text-ui-fg-base">{t.notFoundBody}</p>
      <InteractiveLink href="/">{t.backHome}</InteractiveLink>
    </div>
  )
}
