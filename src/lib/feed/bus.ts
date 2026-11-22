import { EventEmitter } from "node:events";

export interface LiveFeedBroadcastPayload {
  id: number;
  eventType: "daily_pull" | "direct_gift" | "escrow_claim";
  actorDid: string;
  targetDid: string | null;
  thingTid: string;
  createdAt: string;
}

const globalForFeedBus = globalThis as unknown as {
  feedEmitter?: EventEmitter;
};

export function getFeedBus(): EventEmitter {
  if (!globalForFeedBus.feedEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    globalForFeedBus.feedEmitter = emitter;
  }
  return globalForFeedBus.feedEmitter;
}

export function broadcastFeedEvent(payload: LiveFeedBroadcastPayload): void {
  getFeedBus().emit("feed_event", payload);
}
