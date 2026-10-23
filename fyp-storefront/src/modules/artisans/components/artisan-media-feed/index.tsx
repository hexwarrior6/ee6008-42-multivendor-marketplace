import { Heading, Text } from "@medusajs/ui"
import { ArtisanProfile } from "@lib/data/artisans"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type ArtisanMediaFeedProps = {
  media: ArtisanProfile["media"]
  locale: StorefrontLocale
}

const ArtisanMediaFeed = ({ media, locale }: ArtisanMediaFeedProps) => {
  const t = getStorefrontDictionary(locale).artisan

  return (
    <section className="content-container py-12 small:py-16 border-t border-ui-border-base">
      <div className="flex flex-col gap-2 mb-8">
        <Heading level="h2" className="text-2xl font-normal">
          {t.behindScenes}
        </Heading>
        <Text className="text-ui-fg-subtle">{t.behindScenesIntro}</Text>
      </div>
      {media.length ? (
        <div className="grid grid-cols-1 small:grid-cols-3 gap-6">
          {media.map((item) => (
            <article key={item.url} className="border border-ui-border-base">
              <div className="relative aspect-[4/3] bg-ui-bg-subtle">
                {item.type === "video" ? (
                  <video
                    controls
                    preload="metadata"
                    aria-label={item.caption || t.studioVideo}
                    className="h-full w-full object-cover"
                  >
                    <source src={item.url} />
                  </video>
                ) : (
                  <img
                    src={item.url}
                    alt={item.caption || t.studioMedia}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="p-4">
                <Heading level="h3" className="text-base font-medium">
                  {item.caption || t.studioHighlight}
                </Heading>
                <Text className="text-ui-fg-subtle mt-2">
                  {item.type === "video"
                    ? t.videoDescription
                    : t.imageDescription}
                </Text>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="border border-ui-border-base bg-ui-bg-subtle px-6 py-8">
          <Text className="text-ui-fg-subtle">{t.noMedia}</Text>
        </div>
      )}
    </section>
  )
}

export default ArtisanMediaFeed
