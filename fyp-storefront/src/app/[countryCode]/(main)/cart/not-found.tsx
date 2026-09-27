import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).shell

  return {
    title: t.notFoundTitle,
    description: t.cartNotFoundBody,
  }
}

export default async function NotFound() {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).shell

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">{t.notFoundTitle}</h1>
      <p className="text-small-regular text-ui-fg-base">
        {t.cartNotFoundBody}
      </p>
      <InteractiveLink href="/">{t.backHome}</InteractiveLink>
    </div>
  )
}
