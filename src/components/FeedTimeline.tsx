"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  Globe,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
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
  const baseId = useId();
  const globalTabId = `${baseId}-global-tab`;
  const followingTabId = `${baseId}-following-tab`;
  const globalTabRef = useRef<HTMLButtonElement>(null);
  const followingTabRef = useRef<HTMLButtonElement>(null);

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

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!authenticated) return;
    if (
      e.key === "ArrowRight" ||
      e.key === "ArrowLeft" ||
      e.key === "Home" ||
      e.key === "End"
    ) {
      e.preventDefault();
      // Selection by activation because switching fetches feed data over the network
      if (e.key === "Home") {
        globalTabRef.current?.focus();
      } else if (e.key === "End") {
        followingTabRef.current?.focus();
      } else if (document.activeElement === globalTabRef.current) {
        followingTabRef.current?.focus();
      } else {
        globalTabRef.current?.focus();
      }
    }
  }

  return (
    <section aria-label="Things That Happened Feed" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Activity feed filter"
          onKeyDown={handleTabKeyDown}
          className="rpg-tablist"
        >
          <button
            ref={globalTabRef}
            id={globalTabId}
            type="button"
            role="tab"
            aria-selected={mode === "global"}
            tabIndex={mode === "global" ? 0 : -1}
            onClick={(e) => {
              e.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
              switchTab("global");
            }}
            className="rpg-tab inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
          >
            <Globe className="h-3.5 w-3.5 text-[#8ec8ff]" aria-hidden="true" />
            Everyone
          </button>

          {authenticated && (
            <button
              ref={followingTabRef}
              id={followingTabId}
              type="button"
              role="tab"
              aria-selected={mode === "following"}
              tabIndex={mode === "following" ? 0 : -1}
              onClick={(e) => {
                e.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
                switchTab("following");
              }}
              className="rpg-tab inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Users className="h-3.5 w-3.5 text-[#ff99ac]" aria-hidden="true" />
              Friends
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
            className="rpg-btn-blue inline-flex items-center gap-2 px-3 py-1.5 font-pixel text-[11px]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingLiveCount} new {pendingLiveCount === 1 ? "thing" : "things"}{" "}
            — Refresh
          </button>
        )}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={mode === "global" ? globalTabId : followingTabId}
      >
        <div className="space-y-4">
          {items.length === 0 && !loading ? (
            <div className="rpg-panel-subtle p-8 text-center space-y-2">
              <p className="font-pixel text-xs text-[#ffd15c]">
                {mode === "following"
                  ? "Quiet in Your Circle..."
                  : "Nothing Has Happened Yet!"}
              </p>
              <p className="text-sm text-[#cfc3e8]">
                {mode === "following" ? (
                  <>
                    Head to{" "}
                    <Link href="/friends" className="text-[#8ec8ff] underline">
                      FIND MY FRIENDS
                    </Link>{" "}
                    on your <strong>MY THINGS</strong> page to follow your
                    Bluesky friends and see what pointless things they unwrap
                    and give away!
                  </>
                ) : (
                  <>
                    Head over to{" "}
                    <Link href="/get" className="text-[#ff99ac] underline">
                      GET A THING
                    </Link>{" "}
                    to unwrap a brand-new daily thing!
                  </>
                )}
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
                      className="rpg-slot flex h-16 w-16 shrink-0 items-center justify-center p-1.5 hover:border-[#4da6ff]"
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
                            className="font-semibold text-[#ffd15c] hover:underline"
                          >
                            @{item.actor.handle}
                          </Link>

                          {item.eventType === "daily_pull" && (
                            <span className="text-[#cfc3e8]">
                              unwrapped a new thing
                            </span>
                          )}

                          {item.eventType === "direct_gift" && item.target && (
                            <>
                              <span className="text-[#cfc3e8]">gave</span>
                              <ArrowRight
                                className="h-3 w-3 text-[#ff4d6d]"
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
                              <span className="text-[#cfc3e8]">
                                claimed a set-aside thing from
                              </span>
                              <Link
                                href={`/u/${encodeURIComponent(item.target.handle)}`}
                                className="font-semibold text-[#8ec8ff] hover:underline"
                              >
                                @{item.target.handle}
                              </Link>
                            </>
                          )}
                        </div>

                        <span className="text-[11px] text-[#cfc3e8]/75">
                          {formatRelativeTime(item.createdAtIso)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/thing/${item.thing.thingTid}`}
                          className="font-semibold text-sm text-[#fdf6e9] hover:text-[#ffd15c]"
                        >
                          <span className="font-pixel text-[11px] text-[#8ec8ff] mr-1.5">
                            #{String(item.thing.catalogNumber).padStart(4, "0")}
                          </span>
                          {item.thing.name}
                        </Link>

                        {item.sequenceNum >= 1 && (
                          <span className="inline-flex items-center gap-1 rounded bg-[#ff4d6d]/20 px-2 py-0.5 font-pixel text-[9px] text-[#ff99ac]">
                            {item.sequenceNum >= 3 ? (
                              <Flame className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Sparkles
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                            )}
                            Owner #{item.sequenceNum + 1}
                          </span>
                        )}
                      </div>

                      {item.note && (
                        <blockquote className="rounded border-l-2 border-[#ff4d6d] bg-[#160f24]/85 px-3 py-1.5 text-xs italic text-[#fdf6e9]/90">
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
        </div>
      </div>
    </section>
  );
}
