"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Backpack,
  ExternalLink,
  Package,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { DirectoryUserCard, ThingCardItem } from "@/lib/queries";
import { MACRO_CATEGORIES } from "@/lib/generator/categories";
import { ThingGridCard } from "./ThingGridCard";
import { GiveThingModal } from "./GiveThingModal";

interface CatalogBrowserProps {
  initialItems: ThingCardItem[];
  initialTotalCount: number;
  initialUsers: DirectoryUserCard[];
  initialTotalUsersCount: number;
  viewerDid: string | null;
}

export function CatalogBrowser({
  initialItems,
  initialTotalCount,
  initialUsers,
  initialTotalUsersCount,
  viewerDid,
}: CatalogBrowserProps) {
  const thingSearchInputId = useId();
  const userSearchInputId = useId();
  const thingsTabId = useId();
  const usersTabId = useId();
  const thingsPanelRef = useRef<HTMLDivElement>(null);
  const usersPanelRef = useRef<HTMLDivElement>(null);

  const [activeMode, setActiveMode] = useState<"things" | "users">("things");

  // Things Search State
  const [items, setItems] = useState<ThingCardItem[]>(initialItems);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [giveTarget, setGiveTarget] = useState<ThingCardItem | null>(null);

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

  // Sync hidden="until-found" panels for browser find-in-page
  useEffect(() => {
    const tPanel = thingsPanelRef.current;
    const uPanel = usersPanelRef.current;
    if (!tPanel || !uPanel) return;

    if (activeMode === "things") {
      tPanel.removeAttribute("hidden");
      uPanel.setAttribute("hidden", "until-found");
    } else {
      uPanel.removeAttribute("hidden");
      tPanel.setAttribute("hidden", "until-found");
    }

    const onThingsMatch = () => setActiveMode("things");
    const onUsersMatch = () => setActiveMode("users");
    tPanel.addEventListener("beforematch", onThingsMatch);
    uPanel.addEventListener("beforematch", onUsersMatch);
    return () => {
      tPanel.removeEventListener("beforematch", onThingsMatch);
      uPanel.removeEventListener("beforematch", onUsersMatch);
    };
  }, [activeMode]);

  async function runQuery(overrides?: {
    q?: string;
    sem?: boolean;
    cat?: string;
    p?: number;
  }) {
    const qVal = overrides?.q ?? query;
    const semVal = overrides?.sem ?? semantic;
    const catVal = overrides?.cat ?? category;
    const pageVal = overrides?.p ?? page;

    setLoading(true);
    try {
      const url = new URL("/api/catalog", window.location.origin);
      if (qVal.trim()) url.searchParams.set("q", qVal.trim());
      if (semVal && qVal.trim()) url.searchParams.set("semantic", "1");
      if (catVal) url.searchParams.set("category", catVal);
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
              Search every unique pointless thing ordered by latest activity—or
              look up players across Give a Thing.
            </p>
          </div>

          {/* Things vs Users Tablist */}
          <div
            role="tablist"
            aria-label="Search mode"
            className="rpg-tablist"
          >
            <button
              type="button"
              role="tab"
              id={thingsTabId}
              aria-selected={activeMode === "things"}
              onClick={() => setActiveMode("things")}
              className="rpg-tab inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              THINGS ({totalCount})
            </button>
            <button
              type="button"
              role="tab"
              id={usersTabId}
              aria-selected={activeMode === "users"}
              onClick={() => {
                setActiveMode("users");
                if (!userQuery.trim() && query.trim()) {
                  setUserQuery(query);
                  void runUserSearch(query);
                }
              }}
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

              {/* Search Form */}
              <form
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
                    type="search"
                    placeholder={
                      semantic
                        ? "Describe a vibe (e.g. 'nostalgic 90s school desk clutter')..."
                        : "Search by thing name, description, or category..."
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

              {/* Category Pills */}
              <details className="group">
                <summary className="cursor-pointer font-pixel text-[11px] text-[#8ec8ff] hover:underline">
                  {category
                    ? `Filtering Category: ${category} (Click to change)`
                    : "Browse by 30 Thing Categories"}
                </summary>
                <div className="pill-row mt-3 pt-2 border-t border-[#9e762a]/40">
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("");
                      setPage(1);
                      void runQuery({ cat: "", p: 1 });
                    }}
                    className={`px-2.5 py-1 text-xs rounded ${
                      category === ""
                        ? "bg-[#ffd15c] font-semibold text-[#1f1204]"
                        : "bg-[#160f24] text-[#cfc3e8] hover:text-[#fdf6e9]"
                    }`}
                  >
                    All Categories
                  </button>
                  {MACRO_CATEGORIES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setCategory(m.label);
                        setPage(1);
                        void runQuery({ cat: m.label, p: 1 });
                      }}
                      className={`px-2.5 py-1 text-xs rounded ${
                        category === m.label
                          ? "bg-[#4da6ff] font-semibold text-[#07162b]"
                          : "bg-[#160f24] text-[#cfc3e8] hover:text-[#fdf6e9]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>

            {/* Things Results Grid */}
            {items.length === 0 ? (
              <div className="rpg-panel-subtle p-10 text-center space-y-2">
                <p className="font-pixel text-xs text-[#ffd15c]">
                  No Matching Things Found
                </p>
                <p className="text-sm text-[#cfc3e8]">
                  Try clearing your filter—or head to{" "}
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

        {/* Panel 2: Users Search */}
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
              <form
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
                    type="search"
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
