import { EventEmitter } from "node:events";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { CustomOrderService } from "../../../modules/custom-order";
import { streamCustomOrderMessages } from "../custom-order-message-stream";

describe("custom order real-time message stream", () => {
  it("opens an SSE response and publishes messages chronologically", async () => {
    const request = new EventEmitter() as MedusaRequest;
    const response = Object.assign(new EventEmitter(), {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
    }) as unknown as MedusaResponse;
    const service = {
      listAndCountCustomOrderMessages: jest.fn().mockResolvedValue([
        [
          { id: "message-new", created_at: "2026-09-19T02:00:00.000Z" },
          { id: "message-old", created_at: "2026-09-19T01:00:00.000Z" },
        ],
        2,
      ]),
    } as unknown as CustomOrderService;

    await streamCustomOrderMessages(
      request,
      response,
      service,
      "custom-order-1"
    );
    response.emit("close");

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );
    const output = (response.write as jest.Mock).mock.calls.flat().join("");
    expect(output).toContain("event: messages");
    expect(output.indexOf("message-old")).toBeLessThan(
      output.indexOf("message-new")
    );
  });
});
