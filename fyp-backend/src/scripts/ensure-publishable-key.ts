import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"

export default async function ensurePublishableKey({ container }: ExecArgs) {
  const apiKeyService = container.resolve(Modules.API_KEY)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  const [salesChannel] = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })

  if (!salesChannel) {
    throw new Error("Default Sales Channel was not found")
  }

  const existingKeys = await apiKeyService.listApiKeys({
    title: "Webshop",
    type: "publishable",
  })

  let publishableKey = existingKeys[0]

  if (!publishableKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{
          title: "Webshop",
          type: "publishable",
          created_by: "",
        }],
      },
    })
    publishableKey = result[0]
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableKey.id,
      add: [salesChannel.id],
    },
  })

  console.log(`PUBLISHABLE_KEY=${publishableKey.token}`)
}
