import { ArrowUpRightMini } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { Metadata } from "next"
import Link from "next/link"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).shell

  return {
    title: t.notFoundTitle,
    description: t.notFoundBody,
  }
}

export default async function NotFound() {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).shell

  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">{t.notFoundTitle}</h1>
      <p className="text-small-regular text-ui-fg-base">{t.notFoundBody}</p>
      <Link
        className="flex gap-x-1 items-center group"
        href="/"
      >
        <Text className="text-ui-fg-interactive">{t.backHome}</Text>
        <ArrowUpRightMini
          className="group-hover:rotate-45 ease-in-out duration-150"
          color="var(--fg-interactive)"
        />
      </Link>
    </div>
  )
}
