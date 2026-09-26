export const SUPPORTED_EMAIL_LOCALES = ["en", "zh-CN"] as const

export type EmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number]

type OrderLocaleSource = {
  customer?: { metadata?: Record<string, unknown> | null } | null
  shipping_address?: { country_code?: string | null } | null
}

export function normalizeEmailLocale(value: unknown): EmailLocale | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value.trim().toLowerCase().replace("_", "-")
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans") {
    return "zh-CN"
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en"
  }
  return undefined
}

export function resolveOrderEmailLocale(order: OrderLocaleSource): EmailLocale {
  const metadata = order.customer?.metadata
  const metadataLocale = normalizeEmailLocale(metadata?.locale ?? metadata?.language)

  if (metadataLocale) {
    return metadataLocale
  }

  const countryCode = order.shipping_address?.country_code
  return typeof countryCode === "string" && countryCode.toLowerCase() === "cn" ? "zh-CN" : "en"
}
