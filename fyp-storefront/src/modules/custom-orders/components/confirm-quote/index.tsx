"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Text } from "@medusajs/ui"
import { confirmCustomOrderQuote } from "@lib/data/custom-orders"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

export default function ConfirmQuote({
  id,
  version,
  quotedAmount,
  currencyCode,
  locale,
}: {
  id: string
  version: number
  quotedAmount: number
  currencyCode: string
  locale: StorefrontLocale
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const router = useRouter()
  const t = getStorefrontDictionary(locale).customOrder
  return (
    <div className="mt-5 flex flex-col gap-3">
      <Text className="text-ui-fg-muted">{t.confirmQuoteHint}</Text>
      <Button
        disabled={pending || confirmed}
        isLoading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(false)
            const result = await confirmCustomOrderQuote(
              id,
              version,
              quotedAmount,
              currencyCode
            )
            if (result.success) {
              setConfirmed(true)
              router.refresh()
            } else {
              setError(true)
              router.refresh()
            }
          })
        }
      >
        {confirmed ? t.quoteConfirmed : t.confirmQuote}
      </Button>
      {confirmed && <Text role="status">{t.quoteConfirmed}</Text>}
      {error && (
        <Text role="alert" className="text-ui-fg-error">
          {t.confirmQuoteError}
        </Text>
      )}
    </div>
  )
}
