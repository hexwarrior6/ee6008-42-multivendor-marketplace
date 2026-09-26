import "server-only"

import { cookies } from "next/headers"

import { STOREFRONT_LANGUAGE_SWITCH_ENABLED } from "@lib/constants"
import {
  isStorefrontLocale,
  STOREFRONT_LOCALE_COOKIE,
  type StorefrontLocale,
} from "./storefront"

export async function getStorefrontLocale(): Promise<StorefrontLocale> {
  if (!STOREFRONT_LANGUAGE_SWITCH_ENABLED) {
    return "zh-CN"
  }

  const cookieStore = await cookies()
  const selectedLocale = cookieStore.get(STOREFRONT_LOCALE_COOKIE)?.value

  return isStorefrontLocale(selectedLocale) ? selectedLocale : "en"
}
