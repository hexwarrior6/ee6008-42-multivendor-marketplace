import { createHmac } from "node:crypto"
import jwt from "jsonwebtoken"
import { MedusaError } from "@medusajs/framework/utils"

export type TalkJsUser = {
  id: string
  name: string
  email?: string[]
  photoUrl?: string
  custom: Record<string, string>
}

export type LocalCustomOrderMessage = {
  sender_type: "customer" | "artisan" | "admin"
  message: string
  created_at: string | Date
}

export type TalkJsSession = {
  app_id: string
  user_id: string
  conversation_id: string
  token: string
}

type TalkJsConfig = {
  appId: string
  secretKey: string
}

const configurationError = () =>
  new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "TalkJS is not configured. Set TALKJS_APP_ID and TALKJS_SECRET_KEY."
  )

const getConfig = (): TalkJsConfig => {
  const appId = process.env.TALKJS_APP_ID?.trim()
  const secretKey = process.env.TALKJS_SECRET_KEY?.trim()
  if (!appId || !secretKey) {
    throw configurationError()
  }
  return { appId, secretKey }
}

export const customerTalkJsId = (customerId: string) =>
  `customer_${customerId}`

// An artisan profile represents the shop-facing identity in this project's
// order flow. This also lets authorised store staff share one conversation.
export const artisanTalkJsId = (artisanProfileId: string) =>
  `artisan_${artisanProfileId}`

const createConversationId = (orderId: string, secretKey: string) =>
  `custom_order_${createHmac("sha256", secretKey)
    .update(orderId)
    .digest("hex")
    .slice(0, 32)}`

const createToken = (
  config: TalkJsConfig,
  tokenType: "admin" | "user",
  subject?: string
) =>
  jwt.sign({ tokenType }, config.secretKey, {
    issuer: config.appId,
    ...(subject ? { subject } : {}),
    expiresIn: tokenType === "admin" ? "30s" : "1d",
  })

const talkJsRequest = async (
  config: TalkJsConfig,
  path: string,
  options: { method?: "GET" | "PUT" | "POST"; body?: unknown } = {}
) => {
  const method = options.method || "GET"
  let response: Response
  try {
    response = await fetch(
      `https://api.talkjs.com/v1/${encodeURIComponent(config.appId)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${createToken(config, "admin")}`,
          "TalkJS-REST-Version": "2021-07-30",
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      }
    )
  } catch (error) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `TalkJS could not be reached: ${
        error instanceof Error ? error.message : "network error"
      }`
    )
  }

  if (!response.ok && response.status !== 404) {
    const detail = (await response.text()).slice(0, 500)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `TalkJS request failed (${response.status})${
        detail ? `: ${detail}` : ""
      }`
    )
  }
  return response
}

const syncUser = (config: TalkJsConfig, user: TalkJsUser) =>
  talkJsRequest(config, `/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: {
      name: user.name,
      ...(user.email?.length ? { email: user.email } : {}),
      ...(user.photoUrl ? { photoUrl: user.photoUrl } : {}),
      custom: user.custom,
    },
  })

const importExistingMessages = async (
  config: TalkJsConfig,
  conversationId: string,
  messages: LocalCustomOrderMessage[],
  customerId: string,
  artisanId: string
) => {
  for (let offset = 0; offset < messages.length; offset += 1000) {
    const batch = messages.slice(offset, offset + 1000).map((message) => ({
      text: message.message,
      sender:
        message.sender_type === "customer" ? customerId : artisanId,
      createdAt: new Date(message.created_at).getTime(),
      type: "UserMessage",
      custom: { source: "legacy_custom_order_chat" },
    }))
    await talkJsRequest(
      config,
      `/import/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: "POST", body: batch }
    )
  }
}

/**
 * Synchronize the two users and their order conversation from the trusted
 * backend, import the old local history once, and issue a user-scoped token.
 */
export const prepareTalkJsSession = async (input: {
  orderId: string
  orderTitle: string
  currentUserId: string
  customer: TalkJsUser
  artisan: TalkJsUser
  messages: LocalCustomOrderMessage[]
}): Promise<TalkJsSession> => {
  const config = getConfig()
  const conversationId = createConversationId(input.orderId, config.secretKey)
  const existing = await talkJsRequest(
    config,
    `/conversations/${encodeURIComponent(conversationId)}`
  )

  await Promise.all([
    syncUser(config, input.customer),
    syncUser(config, input.artisan),
  ])
  await talkJsRequest(
    config,
    `/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PUT",
      body: {
        participants: [input.customer.id, input.artisan.id],
        subject: input.orderTitle,
        custom: {
          custom_order_id: input.orderId,
          category: "custom_order",
        },
      },
    }
  )

  if (existing.status === 404 && input.messages.length) {
    await importExistingMessages(
      config,
      conversationId,
      input.messages,
      input.customer.id,
      input.artisan.id
    )
  }

  return {
    app_id: config.appId,
    user_id: input.currentUserId,
    conversation_id: conversationId,
    token: createToken(config, "user", input.currentUserId),
  }
}
