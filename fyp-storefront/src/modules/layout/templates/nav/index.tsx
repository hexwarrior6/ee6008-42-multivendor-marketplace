import { Suspense } from "react"

import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import LanguageSwitcher from "@modules/layout/components/language-switcher"
import SideMenu from "@modules/layout/components/side-menu"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"
import { STOREFRONT_LANGUAGE_SWITCH_ENABLED } from "@lib/constants"
import { getStorefrontDictionary } from "@lib/i18n/storefront"

export default async function Nav() {
  const [regions, locale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    getStorefrontLocale(),
  ])
  const t = getStorefrontDictionary(locale).shell

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto border-b duration-200 bg-white border-ui-border-base">
        <nav className="content-container txt-xsmall-plus text-ui-fg-subtle flex items-center justify-between w-full h-full text-small-regular">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              <SideMenu regions={regions} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="txt-compact-xlarge-plus hover:text-ui-fg-base uppercase"
              data-testid="nav-store-link"
            >
              {t.brand}
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            {STOREFRONT_LANGUAGE_SWITCH_ENABLED && (
              <LanguageSwitcher locale={locale} />
            )}
            <div className="hidden small:flex items-center gap-x-6 h-full">
              <LocalizedClientLink
                className="hover:text-ui-fg-base"
                href="/account"
                data-testid="nav-account-link"
              >
                {t.myAccount}
              </LocalizedClientLink>
            </div>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="hover:text-ui-fg-base flex gap-2"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  {t.cart} (0)
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
