import { STOREFRONT_LOCALE_COOKIE, isStorefrontLocale } from "@lib/i18n/storefront"
import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

// Server call sites pass their resolved locale explicitly; client-side
// rendering falls back to the language stored in the storefront cookie.
const getFormatterLocale = (locale?: string): string => {
  if (locale) {
    return locale
  }
  if (typeof document !== "undefined") {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${STOREFRONT_LOCALE_COOKIE}=([^;]*)`)
    )
    const cookieLocale = match?.[1]
    if (isStorefrontLocale(cookieLocale)) {
      return cookieLocale
    }
  }
  return "en-US"
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale,
}: ConvertToLocaleParams) => {
  const formatterLocale = getFormatterLocale(locale)

  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(formatterLocale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString()
}
