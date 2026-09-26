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
        <Text className="text-ui-fg-muted mb-3">定制订单申请</Text>
        <Heading level="h1" className="text-3xl small:text-4xl font-normal">
          与 {artisan.display_name} 开始合作
        </Heading>
        <Text className="text-ui-fg-subtle mt-3 max-w-2xl">
          分享您的想法和预算，工匠会审核需求并提供报价。
        </Text>
      </div>

      <div className="grid grid-cols-1 medium:grid-cols-[minmax(0,1fr)_20rem] gap-10 mt-10 items-start">
        <section aria-labelledby="request-details-heading">
          <Heading
            id="request-details-heading"
            level="h2"
            className="text-xl mb-6"
          >
            需求详情
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
                登录后继续
              </Heading>
              <Text className="text-ui-fg-muted mt-2 mb-5">
                定制需求会关联到您的账户，方便您跟踪报价和订单进度。
              </Text>
              <Link href={`/${countryCode}/account`}>
                <Button>登录或创建账户</Button>
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
                {artisan.location || "独立工匠"}
              </Text>
            </div>
          </div>

          <div className="mt-8">
            <Heading level="h3" className="text-base mb-4">
              接下来会发生什么
            </Heading>
            <ol className="flex flex-col gap-y-4 text-ui-fg-subtle">
              <li>1. 工匠审核您的需求。</li>
              <li>2. 您收到报价并沟通细节。</li>
              <li>3. 确认后开始生产。</li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  )
}
