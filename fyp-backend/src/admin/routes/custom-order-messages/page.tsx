import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type CustomOrder = {
  id: string;
  title: string;
  status: string;
  customer_id: string;
  created_at: string;
};

const CustomOrderMessagesPage = () => {
  const [orders, setOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/admin/custom-orders?limit=100&offset=0");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Unable to load custom orders");
        }
        setOrders(data.custom_orders || []);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load custom orders"
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <Container className="p-0">
      <div className="border-b border-ui-border-base px-6 py-4">
        <Heading>Custom order messages</Heading>
        <Text className="mt-1 text-ui-fg-subtle" size="small">
          Chat directly with buyers about their custom requests.
        </Text>
      </div>
      {loading ? (
        <Text className="px-6 py-5">Loading conversations…</Text>
      ) : error ? (
        <Text className="px-6 py-5 text-ui-fg-error">{error}</Text>
      ) : orders.length ? (
        <div className="divide-y divide-ui-border-base">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/custom-order-messages/${order.id}`}
              className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-ui-bg-subtle-hover"
            >
              <div>
                <Text className="font-medium">{order.title}</Text>
                <Text className="mt-1 text-ui-fg-subtle" size="xsmall">
                  {order.id} · {new Date(order.created_at).toLocaleString()}
                </Text>
              </div>
              <Text className="capitalize text-ui-fg-subtle" size="small">
                {order.status}
              </Text>
            </Link>
          ))}
        </div>
      ) : (
        <Text className="px-6 py-5 text-ui-fg-subtle">
          No custom order conversations are available.
        </Text>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Custom order messages",
});

export default CustomOrderMessagesPage;
