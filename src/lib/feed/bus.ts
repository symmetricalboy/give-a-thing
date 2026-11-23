import { EventEmitter } from "node:events";

export type FeedEventType =
  | "daily_pull"
  | "mystery_box"
  | "mystery_box_purchase"
  | "collection_published"
  | "collection_sold_out"
  | "direct_gift"
  | "escrow_claim";

export interface LiveFeedBroadcastPayload {
  id: number;
  eventType: FeedEventType;
  actorDid: string;
  targetDid: string | null;
  thingTid: string | null;
  collectionTid?: string | null;
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
