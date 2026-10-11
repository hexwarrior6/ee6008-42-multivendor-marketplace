"use client"

import { useRouter } from "next/navigation"

import {
  getStorefrontDictionary,
  STOREFRONT_LOCALE_COOKIE,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type LanguageSwitcherProps = {
  locale: StorefrontLocale
}

export default function LanguageSwitcher({ locale }: LanguageSwitcherProps) {
  const router = useRouter()
  const t = getStorefrontDictionary(locale).language

  const selectLocale = (nextLocale: StorefrontLocale) => {
    if (nextLocale === locale) {
      return
    }

    document.cookie = `${STOREFRONT_LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <div
      className="flex items-center border border-ui-border-base"
      role="group"
      aria-label={t.label}
      data-testid="language-switcher"
    >
      <button
        type="button"
        className={`h-8 px-2.5 text-xs ${
          locale === "zh-CN"
            ? "bg-ui-bg-interactive text-ui-fg-on-color"
            : "hover:bg-ui-bg-subtle"
        }`}
        aria-pressed={locale === "zh-CN"}
        onClick={() => selectLocale("zh-CN")}
      >
        {t.chinese}
      </button>
      <button
        type="button"
        className={`h-8 border-l border-ui-border-base px-2.5 text-xs ${
          locale === "en"
            ? "bg-ui-bg-interactive text-ui-fg-on-color"
            : "hover:bg-ui-bg-subtle"
        }`}
        aria-pressed={locale === "en"}
        onClick={() => selectLocale("en")}
      >
        {t.english}
      </button>
    </div>
  )
}
