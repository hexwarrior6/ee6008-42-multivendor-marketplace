"use client"

import { useStorefrontI18n } from "@lib/i18n/storefront-context"
import { Heading } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import React from "react"

const Help = () => {
  const { t } = useStorefrontI18n()
  return (
    <div className="mt-6">
      <Heading className="text-base-semi">{t.order.helpTitle}</Heading>
      <div className="text-base-regular my-2">
        <ul className="gap-y-2 flex flex-col">
          <li>
            <LocalizedClientLink href="/contact">
              {t.order.contactUs}
            </LocalizedClientLink>
          </li>
          <li>
            <LocalizedClientLink href="/contact">
              {t.order.returnsExchanges}
            </LocalizedClientLink>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Help
