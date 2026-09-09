import { Heading, Text } from "@medusajs/ui"
import { ArtisanProfile, fallbackArtisanMedia } from "@lib/data/artisans"

type ArtisanMediaFeedProps = {
  media: ArtisanProfile["media"]
}

const ArtisanMediaFeed = ({ media }: ArtisanMediaFeedProps) => {
  const displayMedia = media.length ? media : fallbackArtisanMedia

  return (
    <section className="content-container py-12 small:py-16 border-t border-ui-border-base">
      <div className="flex flex-col gap-2 mb-8">
        <Heading level="h2" className="text-2xl font-normal">
          Behind the scenes
        </Heading>
        <Text className="text-ui-fg-subtle">
          Studio moments and process highlights from this artisan.
        </Text>
      </div>
      <div className="grid grid-cols-1 small:grid-cols-3 gap-6">
        {displayMedia.map((item) => (
          <article key={item.url} className="border border-ui-border-base">
            <div className="relative aspect-[4/3] bg-ui-bg-subtle">
              <img
                src={item.url}
                alt={item.caption || "Artisan studio media"}
                className="object-cover"
              />
            </div>
            <div className="p-4">
              <Heading level="h3" className="text-base font-medium">
                {item.caption || "Studio highlight"}
              </Heading>
              <Text className="text-ui-fg-subtle mt-2">
                {item.type === "video" ? "Video from the artisan studio." : "Image from the artisan studio."}
              </Text>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default ArtisanMediaFeed
