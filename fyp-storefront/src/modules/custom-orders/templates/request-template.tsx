import { Avatar, Button, Heading, Text } from "@medusajs/ui"
import Link from "next/link"

import type { ArtisanProfile } from "@lib/data/artisans"
import CustomOrderRequestForm from "@modules/custom-orders/components/request-form"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type CustomOrderRequestTemplateProps = {
  artisan: ArtisanProfile
  countryCode: string
  currencyCode: string
  isAuthenticated: boolean
  locale: StorefrontLocale
}

export default function CustomOrderRequestTemplate({
  artisan,
  countryCode,
  currencyCode,
  isAuthenticated,
  locale,
}: CustomOrderRequestTemplateProps) {
  const t = getStorefrontDictionary(locale).customOrder

  return (
    <main className="content-container py-12 small:py-16">
      <div className="max-w-5xl">
        <Text className="text-ui-fg-muted mb-3">{t.requestEyebrow}</Text>
        <Heading level="h1" className="text-3xl small:text-4xl font-normal">
          {t.startProject} {artisan.display_name}
        </Heading>
        <Text className="text-ui-fg-subtle mt-3 max-w-2xl">
          {t.requestIntro}
        </Text>
      </div>

      <div className="grid grid-cols-1 medium:grid-cols-[minmax(0,1fr)_20rem] gap-10 mt-10 items-start">
        <section aria-labelledby="request-details-heading">
          <Heading
            id="request-details-heading"
            level="h2"
            className="text-xl mb-6"
          >
            {t.requestDetails}
          </Heading>
          {isAuthenticated ? (
            <CustomOrderRequestForm
              artisan={artisan}
              countryCode={countryCode}
              currencyCode={currencyCode}
              locale={locale}
            />
          ) : (
            <div className="border border-ui-border-base bg-ui-bg-subtle p-6">
              <Heading level="h3" className="text-lg">
                {t.signInTitle}
              </Heading>
              <Text className="text-ui-fg-muted mt-2 mb-5">{t.signInBody}</Text>
              <Link href={`/${countryCode}/account`}>
                <Button>{t.signInAction}</Button>
              </Link>
            </div>
          )}
        </section>

        <aside className="border-l border-ui-border-base medium:pl-8">
          <div className="flex items-center gap-4">
            {artisan.avatar_url ? (
              <img
                src={artisan.avatar_url}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <Avatar
                fallback={artisan.display_name.slice(0, 2).toUpperCase()}
                className="h-14 w-14"
              />
            )}
            <div>
              <Text className="font-medium">{artisan.display_name}</Text>
              <Text className="text-ui-fg-muted">
                {artisan.location || t.independentArtisan}
              </Text>
            </div>
          </div>

          <div className="mt-8">
            <Heading level="h3" className="text-base mb-4">
              {t.nextTitle}
            </Heading>
            <ol className="flex flex-col gap-y-4 text-ui-fg-subtle">
              {t.nextSteps.map((step, index) => (
                <li key={step}>
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </main>
  )
}
