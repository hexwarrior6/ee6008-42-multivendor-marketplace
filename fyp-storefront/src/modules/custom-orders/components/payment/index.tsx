"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Text } from "@medusajs/ui"
import {
  prepareCustomOrderPayment,
  refreshCustomOrderPayment,
  type CustomPaymentSession,
} from "@lib/data/custom-order-payments"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"
import WeChatQrCode from "@modules/checkout/components/wechat-qr-code"

export default function CustomOrderPayment({
  id,
  canPrepare,
  verification: initialVerification,
  locale,
}: {
  id: string
  canPrepare: boolean
  verification?: unknown
  locale: StorefrontLocale
}) {
  const t = getStorefrontDictionary(locale).customOrder
  const [session, setSession] = useState<CustomPaymentSession | null>(null)
  const [verification, setVerification] = useState(initialVerification)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <section
      className="mt-6 flex flex-col gap-3 border border-ui-border-base p-4"
      aria-label={t.payment}
    >
      <Text>{t.customPaymentHint}</Text>
      {verification === "verified" ? (
        <Text role="status">{t.customPaymentVerified}</Text>
      ) : (
        <>
          {canPrepare && (
            <Button
              disabled={pending}
              isLoading={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(false)
                  const result = await prepareCustomOrderPayment(id)
                  if (result.success) setSession(result.session)
                  else setError(true)
                })
              }
            >
              {t.customPaymentStart}
            </Button>
          )}
          {session && (
            <div className="flex flex-col gap-3">
              {session.mode === "live" && <Text>{t.customPaymentScan}</Text>}
              {session.mode === "live" && (
                <WeChatQrCode value={session.code_url} />
              )}
            </div>
          )}
          {(verification === "simulated" || session?.mode === "mock") && (
            <Text role="status">{t.customPaymentMock}</Text>
          )}
          {verification === "review_required" && (
            <Text role="alert">{t.customPaymentReview}</Text>
          )}
          {verification === "unverified" && (
            <Text role="status">{t.customPaymentPending}</Text>
          )}
        </>
      )}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(false)
            const result = await refreshCustomOrderPayment(id)
            if (result.success) {
              setVerification(result.verification)
              router.refresh()
            } else setError(true)
          })
        }
      >
        {t.customPaymentRefresh}
      </Button>
      {error && (
        <Text role="alert" className="text-ui-fg-error">
          {t.customPaymentError}
        </Text>
      )}
    </section>
  )
}
