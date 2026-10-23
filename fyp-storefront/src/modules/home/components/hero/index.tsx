import { Button, Heading } from "@medusajs/ui"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

const Hero = async () => {
  const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).shell
  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-3xl leading-10 text-ui-fg-base font-normal"
          >
            {t.heroTitle}
          </Heading>
          <Heading
            level="h2"
            className="text-3xl leading-10 text-ui-fg-subtle font-normal"
          >
            {t.heroSubtitle}
          </Heading>
        </span>
        <a
          href={`${backendUrl}/app`}
          target="_blank"
        >
          <Button variant="secondary">
            {t.becomeSeller}
          </Button>
        </a>
      </div>
    </div>
  )
}

export default Hero
