"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Backpack,
  Coins,
  ExternalLink,
  Gift,
  Package,
  PackageOpen,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  DirectoryCollectionCard,
  DirectoryUserCard,
  ThingCardItem,
} from "@/lib/queries";
import { formatUsdCents } from "@/lib/stripe/pricing";
import { ThingGridCard } from "./ThingGridCard";
import { GiveThingModal } from "./GiveThingModal";

type SearchMode = "things" | "collections" | "users";

interface CatalogBrowserProps {
  initialItems: ThingCardItem[];
  initialTotalCount: number;
  initialCollections: DirectoryCollectionCard[];
  initialTotalCollectionsCount: number;
  initialUsers: DirectoryUserCard[];
  initialTotalUsersCount: number;
  viewerDid: string | null;
}

export function CatalogBrowser({
  initialItems,
  initialTotalCount,
  initialCollections,
  initialTotalCollectionsCount,
  initialUsers,
  initialTotalUsersCount,
  viewerDid,
}: CatalogBrowserProps) {
  const thingSearchInputId = useId();
  const collectionSearchInputId = useId();
  const userSearchInputId = useId();

  const thingsTabId = useId();
  const collectionsTabId = useId();
  const usersTabId = useId();

  const thingsTabRef = useRef<HTMLButtonElement>(null);
  const collectionsTabRef = useRef<HTMLButtonElement>(null);
  const usersTabRef = useRef<HTMLButtonElement>(null);

  const thingsPanelRef = useRef<HTMLDivElement>(null);
  const collectionsPanelRef = useRef<HTMLDivElement>(null);
  const usersPanelRef = useRef<HTMLDivElement>(null);

  const [activeMode, setActiveMode] = useState<SearchMode>("things");

  // Things Search State
  const [items, setItems] = useState<ThingCardItem[]>(initialItems);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [giveTarget, setGiveTarget] = useState<ThingCardItem | null>(null);

  // Collections Search State
  const [collectionQuery, setCollectionQuery] = useState("");
  const [collections, setCollections] =
    useState<DirectoryCollectionCard[]>(initialCollections);
  const [totalCollectionsCount, setTotalCollectionsCount] = useState(
    initialTotalCollectionsCount
  );
  const [collectionPage, setCollectionPage] = useState(1);
  const [collectionsLoading, setCollectionsLoading] = useState(false);

  // Users Search State
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUserCard[]>(initialUsers);
  const [totalUsersCount, setTotalUsersCount] = useState(
    initialTotalUsersCount
  );
  const [usersLoading, setUsersLoading] = useState(false);
  const [followMap, setFollowMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const u of initialUsers) {
      m[u.did] = u.viewerFollows;
    }
    return m;
  });
  const [followBusyDid, setFollowBusyDid] = useState<string | null>(null);

  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const totalCollectionPages = Math.max(
    1,
    Math.ceil(totalCollectionsCount / pageSize)
  );

  // Sync hidden="until-found" panels for browser find-in-page + scroll selected tab into view
  useEffect(() => {
    const panels: Array<[SearchMode, HTMLDivElement | null]> = [
      ["things", thingsPanelRef.current],
      ["collections", collectionsPanelRef.current],
      ["users", usersPanelRef.current],
    ];

    const cleanups: Array<() => void> = [];
    for (const [mode, panel] of panels) {
      if (!panel) continue;
      if (mode === activeMode) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "until-found");
      }
      const onMatch = () => setActiveMode(mode);
      panel.addEventListener("beforematch", onMatch);
      cleanups.push(() => panel.removeEventListener("beforematch", onMatch));
    }

    const activeTabEl =
      activeMode === "things"
        ? thingsTabRef.current
        : activeMode === "collections"
          ? collectionsTabRef.current
          : usersTabRef.current;
    activeTabEl?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      container: "nearest",
    } as ScrollIntoViewOptions);

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [activeMode]);

  function selectTab(mode: SearchMode, focusTab = false) {
    setActiveMode(mode);
    if (mode === "collections" && !collectionQuery.trim() && query.trim()) {
      setCollectionQuery(query);
      setCollectionPage(1);
      void runCollectionSearch({ q: query, p: 1 });
    } else if (mode === "users" && !userQuery.trim() && query.trim()) {
      setUserQuery(query);
      void runUserSearch(query);
    }

    if (focusTab) {
      const ref =
        mode === "things"
          ? thingsTabRef.current
          : mode === "collections"
            ? collectionsTabRef.current
            : usersTabRef.current;
      ref?.focus();
    }
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const order: SearchMode[] = ["things", "collections", "users"];
    const idx = order.indexOf(activeMode);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      selectTab(order[(idx + 1) % order.length]!, true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      selectTab(order[(idx - 1 + order.length) % order.length]!, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectTab(order[0]!, true);
    } else if (e.key === "End") {
      e.preventDefault();
      selectTab(order[order.length - 1]!, true);
    }
  }

  async function runQuery(overrides?: {
    q?: string;
    sem?: boolean;
    p?: number;
  }) {
    const qVal = overrides?.q ?? query;
    const semVal = overrides?.sem ?? semantic;
    const pageVal = overrides?.p ?? page;

    setLoading(true);
    try {
      const url = new URL("/api/catalog", window.location.origin);
      if (qVal.trim()) url.searchParams.set("q", qVal.trim());
      if (semVal && qVal.trim()) url.searchParams.set("semantic", "1");
      url.searchParams.set("page", String(pageVal));

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: ThingCardItem[];
        totalCount: number;
      };
      setItems(data.items);
      setTotalCount(data.totalCount);
    } finally {
      setLoading(false);
    }
  }

  async function runCollectionSearch(overrides?: { q?: string; p?: number }) {
    const qVal = (overrides?.q ?? collectionQuery).trim();
    const pageVal = overrides?.p ?? collectionPage;

    setCollectionsLoading(true);
    try {
      const url = new URL("/api/collections/search", window.location.origin);
      if (qVal) url.searchParams.set("q", qVal);
      url.searchParams.set("page", String(pageVal));

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as {
        collections?: DirectoryCollectionCard[];
        totalCount?: number;
      };
      const list = data.collections ?? [];
      setCollections(list);
      setTotalCollectionsCount(data.totalCount ?? list.length);
    } finally {
      setCollectionsLoading(false);
    }
  }

  async function runUserSearch(qOverride?: string) {
    const qVal = (qOverride ?? userQuery).trim();
    setUsersLoading(true);
    try {
      const url = new URL("/api/users/search", window.location.origin);
      if (qVal) url.searchParams.set("q", qVal);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as {
        users?: DirectoryUserCard[];
        totalCount?: number;
      };
      const list = data.users ?? [];
      setUsers(list);
      setTotalUsersCount(data.totalCount ?? list.length);
      setFollowMap((prev) => {
        const next = { ...prev };
        for (const u of list) {
          if (next[u.did] === undefined) {
            next[u.did] = u.viewerFollows;
          }
        }
        return next;
      });
    } finally {
      setUsersLoading(false);
    }
  }

  async function toggleFollowUser(targetDid: string) {
    const currentlyFollows = Boolean(followMap[targetDid]);
    setFollowBusyDid(targetDid);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: currentlyFollows ? "unfollow" : "follow",
          subjectDid: targetDid,
          source: "manual",
        }),
      });
      if (res.ok) {
        setFollowMap((prev) => ({
          ...prev,
          [targetDid]: !currentlyFollows,
        }));
      }
    } finally {
      setFollowBusyDid(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="rpg-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
              FIND THINGS
            </h1>
            <p className="text-xs text-[#cfc3e8] mt-0.5">
              Search every unique pointless thing, Mystery Box collection, or
              player—ordered by most recent activity.
            </p>
          </div>

          {/* Things / Collections / Users Tablist */}
          <div
            role="tablist"
            aria-label="Search mode"
            onKeyDown={handleTabKeyDown}
            className="rpg-tablist"
          >
            <button
              ref={thingsTabRef}
              type="button"
              role="tab"
              id={thingsTabId}
              tabIndex={activeMode === "things" ? 0 : -1}
              aria-selected={activeMode === "things"}
              onClick={() => selectTab("things")}
              className="rpg-tab inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              THINGS ({totalCount})
            </button>
            <button
              ref={collectionsTabRef}
              type="button"
              role="tab"
              id={collectionsTabId}
              tabIndex={activeMode === "collections" ? 0 : -1}
              aria-selected={activeMode === "collections"}
              onClick={() => selectTab("collections")}
              className="rpg-tab inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
              COLLECTIONS ({totalCollectionsCount})
            </button>
            <button
              ref={usersTabRef}
              type="button"
              role="tab"
              id={usersTabId}
              tabIndex={activeMode === "users" ? 0 : -1}
              aria-selected={activeMode === "users"}
              onClick={() => selectTab("users")}
              className="rpg-tab inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              USERS ({totalUsersCount})
            </button>
          </div>
        </div>
      </div>

      {/* Shared Single-Cell Tabpanel Stack (guarantees identical vertical spacing across tabs) */}
      <div className="rpg-tabpanel-stack">
        {/* Panel 1: Things Search */}
        <div
          ref={thingsPanelRef}
          role="tabpanel"
          aria-labelledby={thingsTabId}
        >
          <div className="space-y-6">
            <div className="rpg-panel p-5 sm:p-6 space-y-4">
              <span className="font-pixel block text-xs text-[#8ec8ff]">
                SEARCH THINGS
              </span>

              <search>
                <form
                  action="/search"
                  method="GET"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPage(1);
                    void runQuery({ p: 1 });
                  }}
                  className="flex flex-col gap-2.5 sm:flex-row"
                >
                  <div className="relative flex-1">
                    <label htmlFor={thingSearchInputId} className="sr-only">
                      Search things
                    </label>
                    <input
                      id={thingSearchInputId}
                      name="q"
                      type="search"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={
                        semantic
                          ? "Describe a vibe (e.g. 'nostalgic 90s school desk clutter')..."
                          : "Search by thing name, description, or flavor text..."
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) {
                            e.preventDefault();
                          }
                        }
                      }}
                      className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
                    />
                  </div>

                  {query.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setPage(1);
                        void runQuery({ q: "", p: 1 });
                      }}
                      className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const next = !semantic;
                      setSemantic(next);
                      if (query.trim()) {
                        setPage(1);
                        void runQuery({ sem: next, p: 1 });
                      }
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 font-pixel text-[10px] ${
                      semantic
                        ? "rpg-btn-blue"
                        : "rpg-btn-secondary text-[#cfc3e8]"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Vibe Search {semantic ? "ON" : "OFF"}
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="rpg-btn-primary inline-flex items-center justify-center gap-1.5 px-5 py-2.5 font-pixel text-xs"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    {loading ? "Searching..." : "Search"}
                  </button>
                </form>
              </search>
            </div>

            {/* Things Results Grid */}
            {items.length === 0 ? (
              <div className="rpg-panel-subtle p-10 text-center space-y-2">
                <p className="font-pixel text-xs text-[#ffd15c]">
                  No Matching Things Found
                </p>
                <p className="text-sm text-[#cfc3e8]">
                  Try clearing your search—or head to{" "}
                  <Link href="/get" className="text-[#ff99ac] underline">
                    GET A THING
                  </Link>{" "}
                  to add a brand-new discovery!
                </p>
              </div>
            ) : (
              <div className="thing-grid">
                {items.map((item) => (
                  <ThingGridCard
                    key={item.thingTid}
                    item={item}
                    isViewerOwner={viewerDid === item.currentOwner.did}
                    onGiveClick={(selected) => setGiveTarget(selected)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    void runQuery({ p });
                  }}
                  className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
                >
                  Prev
                </button>
                <span className="font-pixel text-xs text-[#cfc3e8]">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => {
                    const p = page + 1;
                    setPage(p);
                    void runQuery({ p });
                  }}
                  className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Collections Search */}
        <div
          ref={collectionsPanelRef}
          role="tabpanel"
          aria-labelledby={collectionsTabId}
          hidden
        >
          <div className="space-y-6">
            <div className="rpg-panel p-5 sm:p-6 space-y-4">
              <span className="font-pixel block text-xs text-[#ffd15c]">
                SEARCH COLLECTIONS
              </span>

              <search>
                <form
                  action="/search"
                  method="GET"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setCollectionPage(1);
                    void runCollectionSearch({ p: 1 });
                  }}
                  className="flex flex-col gap-2.5 sm:flex-row"
                >
                  <div className="relative flex-1">
                    <label
                      htmlFor={collectionSearchInputId}
                      className="sr-only"
                    >
                      Search collections by title, description, or creator
                    </label>
                    <input
                      id={collectionSearchInputId}
                      name="q"
                      type="search"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Search collections by name, description, or @creator..."
                      value={collectionQuery}
                      onChange={(e) => setCollectionQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) {
                            e.preventDefault();
                          }
                        }
                      }}
                      className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
                    />
                  </div>

                  {collectionQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setCollectionQuery("");
                        setCollectionPage(1);
                        void runCollectionSearch({ q: "", p: 1 });
                      }}
                      className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={collectionsLoading}
                    className="rpg-btn-primary inline-flex items-center justify-center gap-1.5 px-5 py-2.5 font-pixel text-xs"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    {collectionsLoading ? "Searching..." : "Find Collections"}
                  </button>
                </form>
              </search>
            </div>

            {collections.length === 0 ? (
              <div className="rpg-panel-subtle p-10 text-center space-y-2">
                <p className="font-pixel text-xs text-[#ffd15c]">
                  No Matching Collections Found
                </p>
                <p className="text-sm text-[#cfc3e8]">
                  Try clearing your search—or visit{" "}
                  <Link href="/make" className="text-[#ff99ac] underline">
                    MAKE NEW THINGS
                  </Link>{" "}
                  to publish your own Mystery Box collection!
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((col) => {
                  const isOpen = col.remainingCount > 0;
                  const isPaid = col.priceCents > 0;

                  return (
                    <article
                      key={col.collectionTid}
                      className="rpg-panel-subtle min-w-0 flex flex-col justify-between p-5 space-y-4 transition-colors hover:border-[#ffd15c]"
                    >
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isOpen ? (
                              <span className="rounded bg-[#4be3a0]/20 px-2 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                                OPEN &bull; {col.remainingCount}/{col.totalItems} LEFT
                              </span>
                            ) : (
                              <span className="rounded bg-[#ff4d6d]/20 px-2 py-0.5 font-pixel text-[9px] text-[#ff99ac]">
                                SOLD OUT &bull; {col.totalItems} ITEMS
                              </span>
                            )}

                            <span
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-pixel text-[9px] ${
                                isPaid
                                  ? "bg-[#ffd15c]/20 text-[#ffd15c]"
                                  : "bg-[#4da6ff]/20 text-[#8ec8ff]"
                              }`}
                            >
                              {isPaid ? (
                                <>
                                  <Coins
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                  {formatUsdCents(col.priceCents)}
                                </>
                              ) : (
                                <>
                                  <Gift
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                  FREE
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 min-w-0">
                          <h3 className="font-pixel text-xs sm:text-sm text-[#ffd15c] break-words">
                            <Link
                              href={`/collection/${encodeURIComponent(col.collectionTid)}`}
                              className="hover:underline"
                            >
                              {col.name}
                            </Link>
                          </h3>

                          <div className="flex items-center gap-2 text-xs text-[#cfc3e8]">
                            {col.creator.avatarUrl ? (
                              <img
                                src={col.creator.avatarUrl}
                                alt=""
                                className="h-4 w-4 shrink-0 rounded-full border border-[#ffd15c]/50 object-cover"
                              />
                            ) : null}
                            <span className="truncate">
                              by{" "}
                              <Link
                                href={`/u/${encodeURIComponent(col.creator.handle)}`}
                                className="text-[#8ec8ff] hover:underline"
                              >
                                @{col.creator.handle}
                              </Link>
                            </span>
                          </div>
                        </div>

                        {col.description ? (
                          <p className="text-xs text-[#cfc3e8] line-clamp-2">
                            {col.description}
                          </p>
                        ) : null}

                        {/* Revealed Item Sprite Previews */}
                        {col.previewIcons.length > 0 ? (
                          <div className="flex items-center gap-2 pt-1">
                            {col.previewIcons.map((preview) => (
                              <Link
                                key={preview.thingTid}
                                href={`/thing/${encodeURIComponent(preview.thingTid)}`}
                                title={preview.name}
                                className="rpg-slot flex h-12 w-12 shrink-0 items-center justify-center p-1.5 transition-colors hover:border-[#ffd15c]"
                              >
                                <img
                                  src={preview.iconUrl}
                                  alt={preview.name}
                                  className="pixel-art h-full w-full object-contain"
                                />
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className="rpg-slot flex items-center gap-2.5 px-3 py-2 text-xs text-[#cfc3e8]">
                            <PackageOpen
                              className="h-4 w-4 shrink-0 text-[#ffd15c]"
                              aria-hidden="true"
                            />
                            <span>No items revealed yet—be the first!</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#9e762a]/35 pt-3 pb-1">
                        <span className="text-xs text-[#cfc3e8]">
                          <strong className="font-pixel text-[#ffd15c]">
                            {col.revealedCount}
                          </strong>{" "}
                          / {col.totalItems} Revealed
                        </span>

                        <Link
                          href={`/collection/${encodeURIComponent(col.collectionTid)}`}
                          className="rpg-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px]"
                        >
                          <PackageOpen
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          View Collection
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {totalCollectionPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={collectionPage <= 1 || collectionsLoading}
                  onClick={() => {
                    const p = collectionPage - 1;
                    setCollectionPage(p);
                    void runCollectionSearch({ p });
                  }}
                  className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
                >
                  Prev
                </button>
                <span className="font-pixel text-xs text-[#cfc3e8]">
                  Page {collectionPage} / {totalCollectionPages}
                </span>
                <button
                  type="button"
                  disabled={
                    collectionPage >= totalCollectionPages || collectionsLoading
                  }
                  onClick={() => {
                    const p = collectionPage + 1;
                    setCollectionPage(p);
                    void runCollectionSearch({ p });
                  }}
                  className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Panel 3: Users Search */}
        <div
          ref={usersPanelRef}
          role="tabpanel"
          aria-labelledby={usersTabId}
          hidden
        >
          <div className="space-y-6">
            <div className="rpg-panel-blue p-5 sm:p-6 space-y-4">
              <span className="font-pixel block text-xs text-[#8ec8ff]">
                SEARCH USERS
              </span>
              <search>
                <form
                  action="/search"
                  method="GET"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runUserSearch();
                  }}
                  className="flex flex-col gap-2.5 sm:flex-row"
                >
                  <div className="relative flex-1">
                    <label htmlFor={userSearchInputId} className="sr-only">
                      Search users by handle or display name
                    </label>
                    <input
                      id={userSearchInputId}
                      name="q"
                      type="search"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Search players or @handle (e.g. alice.bsky.social)..."
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) {
                            e.preventDefault();
                          }
                        }
                      }}
                      className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
                    />
                  </div>

                  {userQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserQuery("");
                        void runUserSearch("");
                      }}
                      className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={usersLoading}
                    className="rpg-btn-primary inline-flex items-center justify-center gap-1.5 px-5 py-2.5 font-pixel text-xs"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    {usersLoading ? "Searching..." : "Find Users"}
                  </button>
                </form>
              </search>
            </div>

            {users.length === 0 ? (
              <div className="rpg-panel-subtle p-10 text-center space-y-2">
                <p className="font-pixel text-xs text-[#ffd15c]">
                  No Matching Users Found
                </p>
                <p className="text-sm text-[#cfc3e8]">
                  Try searching by full handle (like{" "}
                  <span className="text-[#8ec8ff]">@giveathing.com</span>) or
                  display name.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {users.map((person) => {
                  const isSelf = viewerDid === person.did;
                  const followsPerson = Boolean(followMap[person.did]);

                  return (
                    <article
                      key={person.did}
                      className="rpg-panel-subtle min-w-0 flex flex-col justify-between p-5 space-y-4 transition-colors hover:border-[#4da6ff]"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {person.avatarUrl ? (
                          <img
                            src={person.avatarUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-sm border border-[#ffd15c]/60 object-cover"
                          />
                        ) : (
                          <div className="rpg-slot flex h-12 w-12 shrink-0 items-center justify-center">
                            <Backpack
                              className="h-5 w-5 text-[#ffd15c]"
                              aria-hidden="true"
                            />
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {person.isRegisteredPlayer ? (
                              <span className="rounded bg-[#4be3a0]/20 px-1.5 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                                PLAYER
                              </span>
                            ) : (
                              <span className="rounded bg-[#4da6ff]/20 px-1.5 py-0.5 font-pixel text-[9px] text-[#8ec8ff]">
                                NOT JOINED YET
                              </span>
                            )}
                          </div>

                          <h3 className="font-semibold text-sm text-[#fdf6e9] break-words">
                            {person.isRegisteredPlayer ? (
                              <Link
                                href={`/u/${encodeURIComponent(person.handle)}`}
                                className="hover:text-[#ffd15c]"
                              >
                                {person.displayName || `@${person.handle}`}
                              </Link>
                            ) : (
                              person.displayName || `@${person.handle}`
                            )}
                          </h3>

                          <p className="truncate text-xs text-[#8ec8ff]">
                            @{person.handle}
                          </p>
                        </div>
                      </div>

                      {person.isRegisteredPlayer ? (
                        <div className="space-y-3 border-t border-[#9e762a]/35 pt-3 pb-1">
                          <div className="flex items-center gap-3 text-xs text-[#cfc3e8]">
                            <span>
                              <strong className="font-pixel text-[#4be3a0]">
                                {person.heldCount}
                              </strong>{" "}
                              Owned
                            </span>
                            <span>&bull;</span>
                            <span>
                              <strong className="font-pixel text-[#ffd15c]">
                                {person.discoveredCount}
                              </strong>{" "}
                              Discovered
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link
                              href={`/u/${encodeURIComponent(person.handle)}`}
                              className="rpg-btn-blue inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px]"
                            >
                              <Backpack
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              View Things
                            </Link>

                            {viewerDid && !isSelf && (
                              <button
                                type="button"
                                disabled={followBusyDid === person.did}
                                onClick={() => void toggleFollowUser(person.did)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] ${
                                  followsPerson
                                    ? "rpg-btn-secondary text-[#4be3a0]"
                                    : "rpg-btn-secondary text-[#cfc3e8]"
                                }`}
                              >
                                {followsPerson ? (
                                  <>
                                    <UserCheck
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Following
                                  </>
                                ) : (
                                  <>
                                    <UserPlus
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Follow
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#9e762a]/35 pt-3 pb-1 text-xs">
                          <span className="text-[#cfc3e8]">
                            Invite by gifting a thing!
                          </span>
                          <a
                            href={`https://bsky.app/profile/${encodeURIComponent(person.handle)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] text-[#8ec8ff]"
                          >
                            Bluesky
                            <ExternalLink
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </a>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <GiveThingModal
        open={Boolean(giveTarget)}
        onClose={() => setGiveTarget(null)}
        thing={giveTarget}
        onSuccess={() => void runQuery()}
      />
    </div>
  );
}
