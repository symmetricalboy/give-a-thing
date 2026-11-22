import { NextRequest } from "next/server";
import { getFeedBus, type LiveFeedBroadcastPayload } from "@/lib/feed/bus";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const bus = getFeedBus();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Client disconnected
        }
      };

      const onEvent = (payload: LiveFeedBroadcastPayload) => {
        send("activity", payload);
      };

      bus.on("feed_event", onEvent);
      send("connected", { ok: true });

      const heartbeat = setInterval(() => {
        send("ping", { ts: Date.now() });
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        bus.off("feed_event", onEvent);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
