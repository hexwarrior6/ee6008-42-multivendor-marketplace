import { Heading, Text } from "@medusajs/ui"
import { ArtisanProfile } from "@lib/data/artisans"

type ArtisanStoryProps = {
  artisan: ArtisanProfile
}

const ArtisanStory = ({ artisan }: ArtisanStoryProps) => {
  const sections = [
    {
      title: "Biography",
      body:
        artisan.bio ||
        "This artisan profile is ready for a biography once the seller adds more story details.",
    },
    {
      title: "Inspiration",
      body:
        artisan.inspiration ||
        "Inspiration notes will appear here after the artisan profile is completed.",
    },
    {
      title: "Creative process",
      body:
        artisan.creative_process ||
        "Creative process details will appear here after the artisan profile is completed.",
    },
  ]

  return (
    <section className="content-container py-12 small:py-16">
      <div className="grid grid-cols-1 small:grid-cols-[240px_1fr] gap-10">
        <div>
          <Heading level="h2" className="text-2xl font-normal">
            Artisan story
          </Heading>
          <Text className="text-ui-fg-subtle mt-2">
            A closer look at the people and process behind this store.
          </Text>
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
