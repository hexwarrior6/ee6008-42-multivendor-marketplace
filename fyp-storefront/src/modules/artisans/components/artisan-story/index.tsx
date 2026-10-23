import { Heading, Text } from "@medusajs/ui"
import { ArtisanProfile } from "@lib/data/artisans"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type ArtisanStoryProps = {
  artisan: ArtisanProfile
  locale: StorefrontLocale
}

const ArtisanStory = ({ artisan, locale }: ArtisanStoryProps) => {
  const t = getStorefrontDictionary(locale).artisan
  const sections = [
    {
      title: t.biography,
      body: artisan.bio || t.biographyFallback,
    },
    {
      title: t.inspiration,
      body: artisan.inspiration || t.inspirationFallback,
    },
    {
      title: t.process,
      body: artisan.creative_process || t.processFallback,
    },
  ]

  return (
    <section className="content-container py-12 small:py-16">
      <div className="grid grid-cols-1 small:grid-cols-[240px_1fr] gap-10">
        <div>
          <Heading level="h2" className="text-2xl font-normal">
            {t.story}
          </Heading>
          <Text className="text-ui-fg-subtle mt-2">{t.storyIntro}</Text>
        </div>
        <div className="grid grid-cols-1 gap-8">
          {sections.map((section) => (
            <article key={section.title}>
              <Heading level="h3" className="text-lg font-medium">
                {section.title}
              </Heading>
              <Text className="text-ui-fg-subtle mt-2 leading-7">
                {section.body}
              </Text>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ArtisanStory
