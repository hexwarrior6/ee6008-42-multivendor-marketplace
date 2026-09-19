import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { CustomOrderService } from "../../modules/custom-order";

const STREAM_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Stream the latest authenticated custom-order conversation over SSE.
 * Browsers reconnect EventSource automatically after a dropped connection.
 */
export const streamCustomOrderMessages = async (
  req: MedusaRequest,
  res: MedusaResponse,
  service: CustomOrderService,
  orderId: string
) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 2000\n\n");

  let closed = false;
  let loading = false;
  let previousSignature = "";

  const publish = async () => {
    if (closed || loading) return;
    loading = true;
    try {
      const [latest, count] = await service.listAndCountCustomOrderMessages(
        { custom_order_id: orderId },
        { take: 100, skip: 0, order: { created_at: "DESC" } }
      );
      const messages = [...latest].reverse();
      const signature = messages.map((message) => message.id).join(":");
      if (signature !== previousSignature) {
        previousSignature = signature;
        res.write(
          `event: messages\ndata: ${JSON.stringify({ messages, count })}\n\n`
        );
      }
    } catch (error) {
      if (!closed) {
        res.write(
          `event: stream-error\ndata: ${JSON.stringify({
            message:
              error instanceof Error ? error.message : "Message stream failed",
          })}\n\n`
        );
      }
    } finally {
      loading = false;
    }
  };

  await publish();
  const messageTimer = setInterval(() => void publish(), STREAM_INTERVAL_MS);
  const heartbeatTimer = setInterval(() => {
    if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, HEARTBEAT_INTERVAL_MS);
  messageTimer.unref?.();
  heartbeatTimer.unref?.();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(messageTimer);
    clearInterval(heartbeatTimer);
  };
  req.once("close", close);
  res.once("close", close);
};
