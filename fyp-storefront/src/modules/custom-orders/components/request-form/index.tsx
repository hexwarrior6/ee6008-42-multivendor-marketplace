"use client"

import { Button, Heading, Input, Label, Text, Textarea } from "@medusajs/ui"
import Link from "next/link"
import { useActionState } from "react"

import { createCustomOrder } from "@lib/data/custom-orders"
import type { CreateCustomOrderState } from "@lib/data/custom-orders"
import type { ArtisanProfile } from "@lib/data/artisans"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type CustomOrderRequestFormProps = {
  artisan: ArtisanProfile
  countryCode: string
  currencyCode: string
  locale: StorefrontLocale
}

const initialState: CreateCustomOrderState = {
  success: false,
  error: null,
  customOrder: null,
}

const fieldClassName = "flex flex-col gap-y-2"

export default function CustomOrderRequestForm({
  artisan,
  countryCode,
  currencyCode,
  locale,
}: CustomOrderRequestFormProps) {
  const [state, formAction] = useActionState(createCustomOrder, initialState)
  const t = getStorefrontDictionary(locale).customOrder

  if (state.success && state.customOrder) {
    const submittedStatus =
      t.status[state.customOrder.status as keyof typeof t.status] ||
      state.customOrder.status

    return (
      <div className="border border-ui-border-base bg-ui-bg-base p-6 small:p-8">
        <Text className="text-ui-fg-muted mb-2">{t.submitted}</Text>
        <Heading level="h2" className="text-2xl mb-3">
          {state.customOrder.title}
        </Heading>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 py-5 border-y border-ui-border-base">
          <dt>
            <Text className="text-ui-fg-muted">{t.requestId}</Text>
          </dt>
          <dd>
            <Text className="break-all">{state.customOrder.id}</Text>
          </dd>
          <dt>
            <Text className="text-ui-fg-muted">{t.statusLabel}</Text>
          </dt>
          <dd>
            <Text>{submittedStatus}</Text>
          </dd>
        </dl>
        <div className="mt-6 border border-dashed border-ui-border-strong p-4">
          <Text className="font-medium">{t.messages}</Text>
          <Text className="text-ui-fg-muted mt-1">{t.messagesPending}</Text>
        </div>
        <Link
          href={`/${countryCode}/artisans/${artisan.id}`}
          className="inline-block mt-6"
        >
          <Button variant="secondary">{t.backToArtisan}</Button>
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-y-6">
      <input type="hidden" name="artisan_id" value={artisan.id} />
      <input type="hidden" name="currency_code" value={currencyCode} />

      <div className={fieldClassName}>
        <Label htmlFor="title">{t.titleLabel}</Label>
        <Input
          id="title"
          name="title"
          maxLength={200}
          required
          placeholder={t.titlePlaceholder}
        />
      </div>

      <div className={fieldClassName}>
        <Label htmlFor="product_category">{t.categoryLabel}</Label>
        <select
          id="product_category"
          name="product_category"
          required
          defaultValue=""
          className="h-10 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-ui-fg-base outline-none focus:border-ui-border-interactive"
        >
          <option value="" disabled>
            {t.selectCategory}
          </option>
          {Object.entries(t.categories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClassName}>
        <Label htmlFor="description">{t.descriptionLabel}</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={5000}
          required
          rows={7}
          placeholder={t.descriptionPlaceholder}
        />
        <Text size="xsmall" className="text-ui-fg-muted">
          {t.descriptionHint}
        </Text>
      </div>

      <div className={fieldClassName}>
        <Label htmlFor="budget_amount">{t.budgetLabel}</Label>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <div className="h-10 flex items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-subtle text-ui-fg-muted uppercase">
            {currencyCode}
          </div>
          <Input
            id="budget_amount"
            name="budget_amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="border border-ui-border-error bg-ui-bg-subtle p-4"
        >
          <Text className="text-ui-fg-error">{state.error}</Text>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <SubmitButton>{t.submit}</SubmitButton>
        <Link href={`/${countryCode}/artisans/${artisan.id}`}>
          <Button type="button" variant="secondary">
            {t.cancel}
          </Button>
        </Link>
      </div>
    </form>
  )
}
