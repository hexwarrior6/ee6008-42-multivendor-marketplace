import { Avatar, Button, Heading, Text } from "@medusajs/ui"
import Link from "next/link"

import type { ArtisanProfile } from "@lib/data/artisans"
import CustomOrderRequestForm from "@modules/custom-orders/components/request-form"

type CustomOrderRequestTemplateProps = {
  artisan: ArtisanProfile
  countryCode: string
  currencyCode: string
  isAuthenticated: boolean
}

export default function CustomOrderRequestTemplate({
  artisan,
  countryCode,
  currencyCode,
  isAuthenticated,
}: CustomOrderRequestTemplateProps) {
  return (
    <main className="content-container py-12 small:py-16">
      <div className="max-w-5xl">
        <Text className="text-ui-fg-muted mb-3">Custom order request</Text>
        <Heading level="h1" className="text-3xl small:text-4xl font-normal">
          Start a project with {artisan.display_name}
        </Heading>
        <Text className="text-ui-fg-subtle mt-3 max-w-2xl">
          Share your idea and estimated budget. The artisan can review the
          request and follow up with a quote.
        </Text>
      </div>

      <div className="grid grid-cols-1 medium:grid-cols-[minmax(0,1fr)_20rem] gap-10 mt-10 items-start">
        <section aria-labelledby="request-details-heading">
          <Heading
            id="request-details-heading"
            level="h2"
            className="text-xl mb-6"
          >
            Request details
          </Heading>
          {isAuthenticated ? (
            <CustomOrderRequestForm
              artisan={artisan}
              countryCode={countryCode}
              currencyCode={currencyCode}
            />
          ) : (
            <div className="border border-ui-border-base bg-ui-bg-subtle p-6">
              <Heading level="h3" className="text-lg">
                Sign in to continue
              </Heading>
              <Text className="text-ui-fg-muted mt-2 mb-5">
                Custom requests are linked to your customer account so you can
                track quotes and order progress.
              </Text>
              <Link href={`/${countryCode}/account`}>
                <Button>Sign in or create an account</Button>
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
                {artisan.location || "Independent artisan"}
              </Text>
            </div>
          </div>

          <div className="mt-8">
            <Heading level="h3" className="text-base mb-4">
              What happens next
            </Heading>
            <ol className="flex flex-col gap-y-4 text-ui-fg-subtle">
              <li>1. The artisan reviews your request.</li>
              <li>2. You receive a quote and discuss the details.</li>
              <li>3. Production starts after confirmation.</li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  )
}
