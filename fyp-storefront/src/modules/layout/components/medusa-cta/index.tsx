"use client"

import { Text } from "@medusajs/ui"

import { useStorefrontI18n } from "@lib/i18n/storefront-context"
import Medusa from "../../../common/icons/medusa"
import NextJs from "../../../common/icons/nextjs"

const MedusaCTA = () => {
  const { t } = useStorefrontI18n()

  return (
    <Text className="flex gap-x-2 txt-compact-small-plus items-center">
      {t.shell.poweredBy}
      <a href="https://www.medusajs.com" target="_blank" rel="noreferrer">
        <Medusa fill="#9ca3af" className="fill-[#9ca3af]" />
      </a>
      &
      <a href="https://nextjs.org" target="_blank" rel="noreferrer">
        <NextJs fill="#9ca3af" />
      </a>
    </Text>
  )
}

export default MedusaCTA
