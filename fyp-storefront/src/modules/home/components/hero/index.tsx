import { Github } from "@medusajs/icons"
import { Button, Heading } from "@medusajs/ui"

const Hero = () => {
  const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-3xl leading-10 text-ui-fg-base font-normal"
          >
            Multi Vendor E Commerce Platform
          </Heading>
          <Heading
            level="h2"
            className="text-3xl leading-10 text-ui-fg-subtle font-normal"
          >
            Powered by Medusa and Next.js
          </Heading>
        </span>
        <a
          href={`${backendUrl}/app`}
          target="_blank"
        >
          <Button variant="secondary">
            Become a seller
            {/* <Github /> */}
          </Button>
        </a>
      </div>
    </div>
  )
}

export default Hero
