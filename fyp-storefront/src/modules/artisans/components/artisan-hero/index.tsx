import { Avatar, Button, Heading, Text } from "@medusajs/ui"
import Link from "next/link"
import { ArtisanProfile } from "@lib/data/artisans"

type ArtisanHeroProps = {
  artisan: ArtisanProfile
  countryCode: string
}

const ArtisanHero = ({ artisan, countryCode }: ArtisanHeroProps) => {
  return (
    <section className="border-b border-ui-border-base bg-ui-bg-subtle">
      <div className="content-container py-16 small:py-24">
        <div className="grid grid-cols-1 small:grid-cols-[1fr_220px] gap-10 items-center">
          <div className="max-w-3xl">
            <Text className="text-ui-fg-muted mb-3">
              {artisan.location || "Independent"} artisan
            </Text>
            <Heading
              level="h1"
              className="text-4xl small:text-5xl leading-tight font-normal text-ui-fg-base"
            >
              {artisan.display_name}
            </Heading>
            <Text className="text-xl text-ui-fg-subtle mt-4 max-w-2xl">
              {artisan.bio ||
                "Independent handmade studio creating small-batch goods with a personal touch."}
            </Text>
            {!!artisan.specialties?.length && (
              <div className="flex flex-wrap gap-2 mt-6">
                {artisan.specialties.map((specialty) => (
                  <span
                    key={specialty}
                    className="border border-ui-border-base px-3 py-1 text-small-regular text-ui-fg-subtle"
                  >
                    {specialty}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href={`/${countryCode}/store`}>
                <Button variant="secondary">View all products</Button>
              </Link>
              <Link
                href={`/${countryCode}/custom-orders/new?artisan_id=${artisan.id}`}
              >
                <Button>Request custom order</Button>
              </Link>
            </div>
          </div>
          <div className="flex small:justify-end">
            {artisan.avatar_url ? (
              <img
                src={artisan.avatar_url}
                alt={`${artisan.display_name} avatar`}
                className="h-40 w-40 rounded-full object-cover border border-ui-border-base"
              />
            ) : (
              <Avatar
                fallback={artisan.display_name.slice(0, 2).toUpperCase()}
                className="h-40 w-40"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ArtisanHero
