"use client"

import { Button, Text, Textarea } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"

import {
  sendCustomOrderMessage,
  type CustomOrderMessage,
  type SendMessageState,
} from "@lib/data/custom-orders"

const initialState: SendMessageState = { success: false, error: null }

export default function CustomOrderChat({
  orderId,
  countryCode,
  messages: initialMessages,
}: {
  orderId: string
  countryCode: string
  messages: CustomOrderMessage[]
}) {
  const router = useRouter()
  const [messages, setMessages] = useState(initialMessages)
  const [connection, setConnection] = useState<
    "connecting" | "live" | "reconnecting"
  >("connecting")
  const formRef = useRef<HTMLFormElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const sendAction = sendCustomOrderMessage.bind(null, orderId, countryCode)
  const [state, formAction, pending] = useActionState(sendAction, initialState)

  useEffect(() => setMessages(initialMessages), [initialMessages])

  useEffect(() => {
    const source = new EventSource(
      `/api/custom-orders/${encodeURIComponent(orderId)}/messages/stream`
    )
    source.onopen = () => setConnection("live")
    source.onerror = () => setConnection("reconnecting")
    const receiveMessages = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          messages?: CustomOrderMessage[]
        }
        if (Array.isArray(payload.messages)) setMessages(payload.messages)
      } catch {
        setConnection("reconnecting")
      }
    }
    source.addEventListener("messages", receiveMessages as EventListener)
    return () => source.close()
  }, [orderId])

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messages.length])

  return (
    <div className="mt-4 overflow-hidden border border-ui-border-base">
      <div
        className="max-h-[28rem] min-h-48 space-y-4 overflow-y-auto bg-ui-bg-subtle p-4 small:p-5"
        aria-live="polite"
      >
        {messages.length ? (
          messages.map((message) => {
            const fromCustomer = message.sender_type === "customer"
            return (
              <article
                key={message.id}
                className={`flex ${
                  fromCustomer ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 small:max-w-[70%] ${
                    fromCustomer
                      ? "bg-ui-bg-interactive text-ui-fg-on-color"
                      : "border border-ui-border-base bg-ui-bg-base"
                  }`}
                >
                  <Text
                    size="xsmall"
                    className={
                      fromCustomer ? "text-ui-fg-on-color" : "text-ui-fg-muted"
                    }
                  >
                    {fromCustomer
                      ? "You"
                      : message.sender_type === "artisan"
                      ? "Artisan"
                      : "Administrator"}
                  </Text>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {message.message}
                  </p>
                  <time
                    dateTime={message.created_at}
                    className={`mt-2 block text-xs ${
                      fromCustomer ? "text-ui-fg-on-color" : "text-ui-fg-muted"
                    }`}
                  >
                    {new Date(message.created_at).toLocaleString()}
                  </time>
                </div>
              </article>
            )
          })
        ) : (
          <div className="flex min-h-40 items-center justify-center text-center">
            <div>
              <Text className="font-medium">No messages yet</Text>
              <Text className="mt-1 text-ui-fg-muted">
                Ask the artisan about materials, measurements, or delivery.
              </Text>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="space-y-3 p-4 small:p-5"
      >
        <label htmlFor="custom-order-message" className="text-sm font-medium">
          Send a message
        </label>
        <Textarea
          id="custom-order-message"
          name="message"
          required
          maxLength={5000}
          rows={3}
          placeholder="Write a message to the artisan"
        />
        {state.error && (
          <Text role="alert" className="text-ui-fg-error">
            {state.error}
          </Text>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text size="xsmall" className="text-ui-fg-muted">
            {connection === "live"
              ? "Real-time chat connected"
              : connection === "connecting"
              ? "Connecting to real-time chat…"
              : "Connection lost. Reconnecting…"}
          </Text>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.refresh()}
            >
              Refresh
            </Button>
            <Button type="submit" isLoading={pending} disabled={pending}>
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
