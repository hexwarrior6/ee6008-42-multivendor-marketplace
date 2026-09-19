import { Button, Container, Heading, Text, Textarea } from "@medusajs/ui";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

type CustomOrder = {
  id: string;
  title: string;
  status: string;
  description: string;
};

type Message = {
  id: string;
  sender_type: "customer" | "artisan" | "admin";
  message: string;
  created_at: string;
};

const CustomOrderConversationPage = () => {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<CustomOrder | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "live" | "reconnecting"
  >("connecting");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [orderResponse, messagesResponse] = await Promise.all([
        fetch(`/admin/custom-orders/${encodeURIComponent(id)}`),
        fetch(
          `/admin/custom-orders/${encodeURIComponent(
            id
          )}/messages?limit=100&offset=0`
        ),
      ]);
      const [orderData, messagesData] = await Promise.all([
        orderResponse.json(),
        messagesResponse.json(),
      ]);
      if (!orderResponse.ok) {
        throw new Error(
          orderData?.message || "Unable to load the custom order"
        );
      }
      if (!messagesResponse.ok) {
        throw new Error(messagesData?.message || "Unable to load messages");
      }
      setOrder(orderData.custom_order);
      setMessages(messagesData.messages || []);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load chat"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const source = new EventSource(
      `/admin/custom-orders/${encodeURIComponent(id)}/messages/stream`
    );
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("reconnecting");
    const receiveMessages = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { messages?: Message[] };
        if (Array.isArray(payload.messages)) setMessages(payload.messages);
      } catch {
        setConnection("reconnecting");
      }
    };
    source.addEventListener("messages", receiveMessages as EventListener);
    return () => source.close();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages.length]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || !id) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(
        `/admin/custom-orders/${encodeURIComponent(id)}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: content, attachments: [] }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "The message could not be sent");
      }
      setMessage("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The message could not be sent"
      );
    } finally {
      setSending(false);
    }
  };

  if (loading)
    return (
      <Container>
        <Text>Loading conversation…</Text>
      </Container>
    );
  if (!order) {
    return (
      <Container>
        <Text className="text-ui-fg-error">
          {error || "Conversation not found"}
        </Text>
      </Container>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Container>
        <Link
          to="/custom-order-messages"
          className="text-ui-fg-interactive text-sm"
        >
          Back to conversations
        </Link>
        <Heading className="mt-3">{order.title}</Heading>
        <Text className="mt-1 text-ui-fg-subtle" size="small">
          {order.status} · {order.id}
        </Text>
        <Text className="mt-4 whitespace-pre-wrap">{order.description}</Text>
      </Container>

      <Container>
        <div className="flex items-center justify-between gap-4">
          <Heading level="h2">Buyer conversation</Heading>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {connection === "live"
              ? "Real-time chat connected"
              : connection === "connecting"
              ? "Connecting…"
              : "Reconnecting…"}
          </Text>
        </div>

        <div
          className="my-4 max-h-96 min-h-48 space-y-3 overflow-y-auto bg-ui-bg-subtle p-4"
          aria-live="polite"
        >
          {messages.length ? (
            messages.map((item) => {
              const fromBuyer = item.sender_type === "customer";
              return (
                <div
                  key={item.id}
                  className={`flex ${
                    fromBuyer ? "justify-start" : "justify-end"
                  }`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-3 ${
                      fromBuyer
                        ? "bg-ui-bg-base"
                        : "bg-ui-bg-interactive text-ui-fg-on-color"
                    }`}
                  >
                    <Text
                      size="xsmall"
                      className={
                        fromBuyer ? "text-ui-fg-subtle" : "text-ui-fg-on-color"
                      }
                    >
                      {fromBuyer ? "Buyer" : "You"}
                    </Text>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {item.message}
                    </p>
                    <time
                      className="mt-2 block text-xs opacity-70"
                      dateTime={item.created_at}
                    >
                      {new Date(item.created_at).toLocaleString()}
                    </time>
                  </div>
                </div>
              );
            })
          ) : (
            <Text className="text-ui-fg-subtle">No messages yet.</Text>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={sendMessage} className="space-y-3">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            maxLength={5000}
            rows={3}
            placeholder="Write a message to the buyer"
          />
          {error && <Text className="text-ui-fg-error">{error}</Text>}
          <div className="flex justify-end">
            <Button type="submit" isLoading={sending} disabled={sending}>
              Send
            </Button>
          </div>
        </form>
      </Container>
    </div>
  );
};

export default CustomOrderConversationPage;
