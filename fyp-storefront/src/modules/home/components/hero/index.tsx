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
            多商家手作电商平台
          </Heading>
          <Heading
            level="h2"
            className="text-3xl leading-10 text-ui-fg-subtle font-normal"
          >
            汇聚独立手艺人与原创作品
          </Heading>
        </span>
        <a
          href={`${backendUrl}/app`}
          target="_blank"
        >
          <Button variant="secondary">
            成为商家
            {/* <Github /> */}
          </Button>
        </a>
      </div>
    </div>
  )
}

export default Hero
