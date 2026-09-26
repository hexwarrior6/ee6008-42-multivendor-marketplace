import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"
import { StorefrontLocaleProvider } from "@lib/i18n/storefront-context"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getStorefrontLocale()

  return (
    <html lang={locale} data-mode="light">
      <body>
        <StorefrontLocaleProvider locale={locale}>
          <main className="relative">{props.children}</main>
        </StorefrontLocaleProvider>
      </body>
    </html>
  )
}
