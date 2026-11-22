"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Globe, RefreshCw, Sparkles, Users } from "lucide-react";
import type { FeedItemDTO } from "@/lib/queries";

interface FeedTimelineProps {
  initialGlobalItems: FeedItemDTO[];
  initialGlobalCursor: number | null;
  authenticated: boolean;
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  );
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FeedTimeline({
  initialGlobalItems,
  initialGlobalCursor,
  authenticated,
}: FeedTimelineProps) {
  const [mode, setMode] = useState<"global" | "following">("global");
  const [items, setItems] = useState<FeedItemDTO[]>(initialGlobalItems);
  const [nextCursor, setNextCursor] = useState<number | null>(
    initialGlobalCursor
  );
  const [loading, setLoading] = useState(false);
  const [pendingLiveCount, setPendingLiveCount] = useState(0);

  async function loadFeed(targetMode: "global" | "following", cursor?: number) {
    setLoading(true);
    try {
      const url = new URL("/api/feed", window.location.origin);
      url.searchParams.set("mode", targetMode);
      if (cursor) url.searchParams.set("cursor", String(cursor));

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: FeedItemDTO[];
        nextCursor: number | null;
      };

      if (cursor) {
        setItems((prev) => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const es = new EventSource("/api/feed/stream");
    es.addEventListener("activity", () => {
      setPendingLiveCount((c) => c + 1);
    });
    return () => es.close();
  }, []);

  function switchTab(newMode: "global" | "following") {
    setMode(newMode);
    setPendingLiveCount(0);
    void loadFeed(newMode);
  }

  return (
    <section aria-label="Activity Feed" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-2">
          <button
            type="button"
            onClick={() => switchTab("global")}
            className={`inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs ${
              mode === "global" ? "rpg-btn-primary" : "rpg-btn-secondary"
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            Global Feed
          </button>

          {authenticated && (
            <button
              type="button"
              onClick={() => switchTab("following")}
              className={`inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs ${
                mode === "following" ? "rpg-btn-primary" : "rpg-btn-secondary"
              }`}
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Following
            </button>
          )}
        </div>

        {pendingLiveCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setPendingLiveCount(0);
              void loadFeed(mode);
            }}
            className="rpg-btn-secondary inline-flex items-center gap-2 border-[#4be3a0] px-3 py-1.5 font-pixel text-[11px] text-[#4be3a0]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingLiveCount} new {pendingLiveCount === 1 ? "event" : "events"}{" "}
            — Refresh
          </button>
        )}
      </div>

      {items.length === 0 && !loading ? (
        <div className="rpg-panel-subtle p-8 text-center">
          <p className="font-pixel text-xs text-[#f5c451] mb-2">
            {mode === "following"
              ? "Quiet in Your Circle..."
              : "The Ledger Awaits Its First Thing!"}
          </p>
          <p className="text-sm text-[#bfb2d6]">
            {mode === "following"
              ? "Import your Bluesky friends on the Friends tab to see what pointless things they pull and give away!"
              : "Click Get a Thing above to discover Catalog #0001!"}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rpg-panel-subtle p-4">
              <div className="flex items-start gap-3.5">
                {/* 16-bit Sprite Slot */}
                <Link
                  href={`/thing/${item.thing.thingTid}`}
                  className="rpg-slot flex h-16 w-16 shrink-0 items-center justify-center p-1.5 hover:border-[#f5c451]"
                >
                  <img
                    src={item.thing.iconUrl}
                    alt={item.thing.iconAlt}
                    width={52}
                    height={52}
                    className="pixel-art h-13 w-13 object-contain"
                  />
                </Link>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/u/${encodeURIComponent(item.actor.handle)}`}
                        className="font-semibold text-[#f5c451] hover:underline"
                      >
                        @{item.actor.handle}
                      </Link>

                      {item.eventType === "daily_pull" && (
                        <span className="text-[#bfb2d6]">
                          pulled a new thing
                        </span>
                      )}

                      {item.eventType === "direct_gift" && item.target && (
                        <>
                          <span className="text-[#bfb2d6]">gave</span>
                          <ArrowRight
                            className="h-3 w-3 text-[#e5b54f]"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/u/${encodeURIComponent(item.target.handle)}`}
                            className="font-semibold text-[#4be3a0] hover:underline"
                          >
                            @{item.target.handle}
                          </Link>
                        </>
                      )}

                      {item.eventType === "escrow_claim" && item.target && (
                        <>
                          <span className="text-[#bfb2d6]">
                            claimed a set-aside thing from
                          </span>
                          <Link
                            href={`/u/${encodeURIComponent(item.target.handle)}`}
                            className="font-semibold text-[#5cc8ff] hover:underline"
                          >
                            @{item.target.handle}
                          </Link>
                        </>
                      )}
                    </div>

                    <span className="text-[11px] text-[#bfb2d6]/75">
                      {formatRelativeTime(item.createdAtIso)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/thing/${item.thing.thingTid}`}
                      className="font-semibold text-sm text-[#fbf4e4] hover:text-[#f5c451]"
                    >
                      <span className="font-pixel text-[11px] text-[#e5b54f] mr-1.5">
                        #{String(item.thing.catalogNumber).padStart(4, "0")}
                      </span>
                      {item.thing.name}
                    </Link>

                    {item.sequenceNum >= 1 && (
                      <span className="inline-flex items-center gap-1 rounded bg-[#ff5c8a]/20 px-2 py-0.5 font-pixel text-[9px] text-[#ff8fb1]">
                        {item.sequenceNum >= 3 ? (
                          <Flame className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                        )}
                        Owner #{item.sequenceNum + 1}
                      </span>
                    )}
                  </div>

                  {item.note && (
                    <blockquote className="rounded border-l-2 border-[#e5b54f] bg-[#140f1d]/80 px-3 py-1.5 text-xs italic text-[#fbf4e4]/90">
                      &ldquo;{item.note}&rdquo;
                    </blockquote>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="pt-2 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadFeed(mode, nextCursor)}
            className="rpg-btn-secondary px-5 py-2.5 font-pixel text-xs"
          >
            {loading ? "Loading..." : "Load Older Activity"}
          </button>
        </div>
      )}
    </section>
  );
}
