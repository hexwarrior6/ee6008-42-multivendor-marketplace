"use client"

import { synchronizeCartCurrency } from "@lib/data/seller-cart"
import { getStorefrontDictionary, type StorefrontLocale } from "@lib/i18n/storefront"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"

export default function CartCurrencyNotice({ cartId, currency, locale }: {
  cartId: string
  currency: string
  locale: StorefrontLocale
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const t = getStorefrontDictionary(locale).checkout

  return (
    <section className="content-container py-12" role="alert">
      <p>{t.currencyChanged.replace("{currency}", currency.toUpperCase())}</p>
      <button type="button" disabled={pending} className="mt-4 rounded border px-4 py-2 disabled:opacity-50"
        onClick={() => {
          setError("")
          startTransition(async () => {
            try {
              await synchronizeCartCurrency(cartId)
              router.replace(`${pathname}?step=delivery`)
              router.refresh()
            } catch {
              setError(t.updateCartPricesFailed)
            }
          })
        }}>
        {pending ? t.updatingCartPrices : t.updateCartPrices}
      </button>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </section>
  )
}
