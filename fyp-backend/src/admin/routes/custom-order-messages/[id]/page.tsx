import "@talkjs/react-components/default.css";
import { Container, Heading, Text } from "@medusajs/ui";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

const Chatbox = lazy(async () => {
  const module = await import("@talkjs/react-components");
  return { default: module.Chatbox };
});

type CustomOrder = {
  id: string;
  title: string;
  status: string;
  description: string;
};

type TalkJsSession = {
  app_id: string;
  user_id: string;
  conversation_id: string;
  token: string;
};

const CustomOrderConversationPage = () => {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<CustomOrder | null>(null);
  const [session, setSession] = useState<TalkJsSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [orderResponse, talkJsResponse] = await Promise.all([
        fetch(`/admin/custom-orders/${encodeURIComponent(id)}`),
        fetch(`/admin/custom-orders/${encodeURIComponent(id)}/talkjs`),
      ]);
      const [orderData, talkJsData] = await Promise.all([
        orderResponse.json(),
        talkJsResponse.json(),
      ]);
      if (!orderResponse.ok) {
        throw new Error(orderData?.message || "Unable to load the custom order");
      }
      if (!talkJsResponse.ok) {
        throw new Error(talkJsData?.message || "Unable to connect to TalkJS");
      }
      setOrder(orderData.custom_order);
      setSession(talkJsData.talkjs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load chat");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Container>
        <Text>Connecting to TalkJS…</Text>
      </Container>
    );
  }
  if (!order || !session) {
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
        <Heading level="h2">Buyer conversation</Heading>
        <div className="mt-4 overflow-hidden border border-ui-border-base">
          <Suspense fallback={<Text>Loading TalkJS chat…</Text>}>
            <Chatbox
              appId={session.app_id}
              userId={session.user_id}
              conversationId={session.conversation_id}
              token={session.token}
              chatHeaderVisible={false}
              style={{ width: "100%", height: "32rem" }}
            />
          </Suspense>
        </div>
      </Container>
    </div>
  );
};

export default CustomOrderConversationPage;
