"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  HeartHandshake,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

interface FriendItem {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface BskyCandidate extends FriendItem {
  alreadyFollowing: boolean;
}

interface BskyNetwork {
  following: BskyCandidate[];
  followers: BskyCandidate[];
  mutuals: BskyCandidate[];
}

interface GlobalSearchActor extends FriendItem {
  isRegisteredPlayer: boolean;
}

type NetworkTabKey = "following" | "followers" | "mutuals";

interface FriendsManagerProps {
  viewerHandle: string;
  initialAutoImport: boolean;
  initialFollowing: FriendItem[];
}

export function FriendsManager({
  viewerHandle,
  initialAutoImport,
  initialFollowing,
}: FriendsManagerProps) {
  const router = useRouter();
  const baseId = useId();
  const searchInputId = `${baseId}-search`;

  const tabIds: Record<NetworkTabKey, string> = {
    following: `${baseId}-tab-following`,
    followers: `${baseId}-tab-followers`,
    mutuals: `${baseId}-tab-mutuals`,
  };
  const tabRefs: Record<
    NetworkTabKey,
    React.RefObject<HTMLButtonElement | null>
  > = {
    following: useRef<HTMLButtonElement>(null),
    followers: useRef<HTMLButtonElement>(null),
    mutuals: useRef<HTMLButtonElement>(null),
  };

  const [autoImport, setAutoImport] = useState(initialAutoImport);
  const [following, setFollowing] = useState<FriendItem[]>(initialFollowing);
  const [network, setNetwork] = useState<BskyNetwork | null>(null);
  const [activeTab, setActiveTab] = useState<NetworkTabKey>("following");
  const [searchQuery, setSearchQuery] = useState("");
  const [globalActors, setGlobalActors] = useState<GlobalSearchActor[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);

  const [scanning, setScanning] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [personBusyDid, setPersonBusyDid] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const followedDidSet = new Set(following.map((f) => f.did));

  const handleScanBluesky = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/friends?scanBsky=1");
      if (!res.ok) return;
      const data = (await res.json()) as {
        following: FriendItem[];
        bskyNetwork?: BskyNetwork | null;
        bskyCandidates?: BskyCandidate[];
      };
      setFollowing(data.following);
      setNetwork(
        data.bskyNetwork ?? {
          following: data.bskyCandidates ?? [],
          followers: [],
          mutuals: [],
        }
      );
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void handleScanBluesky();
  }, [handleScanBluesky]);

  // Live Bluesky directory search when user types 2+ characters
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setGlobalActors([]);
      setGlobalSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setGlobalSearching(true);
      try {
        const res = await fetch(
          `/api/actors/search?q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { actors?: GlobalSearchActor[] };
          setGlobalActors(data.actors ?? []);
        }
      } catch {
        // Ignore transient search errors
      } finally {
        setGlobalSearching(false);
      }
    }, 240);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  function updateCandidateFollowStatus(did: string, nowFollowing: boolean) {
    setNetwork((prev) => {
      if (!prev) return prev;
      const mapList = (list: BskyCandidate[]) =>
        list.map((c) =>
          c.did === did ? { ...c, alreadyFollowing: nowFollowing } : c
        );
      return {
        following: mapList(prev.following),
        followers: mapList(prev.followers),
        mutuals: mapList(prev.mutuals),
      };
    });
  }

  async function handleFollowPerson(person: FriendItem) {
    setPersonBusyDid(person.did);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "follow",
          subjectDid: person.did,
          source: "bsky_import",
        }),
      });
      if (res.ok) {
        updateCandidateFollowStatus(person.did, true);
        setFollowing((prev) =>
          prev.some((f) => f.did === person.did) ? prev : [person, ...prev]
        );
        router.refresh();
      }
    } finally {
      setPersonBusyDid(null);
    }
  }

  async function handleUnfollow(did: string) {
    setPersonBusyDid(did);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unfollow", subjectDid: did }),
      });
      if (res.ok) {
        setFollowing((prev) => prev.filter((f) => f.did !== did));
        updateCandidateFollowStatus(did, false);
        router.refresh();
      }
    } finally {
      setPersonBusyDid(null);
    }
  }

  async function handleFollowAllInTab(tabKey: NetworkTabKey) {
    if (!network) return;
    const targets = network[tabKey]
      .filter((c) => !followedDidSet.has(c.did))
      .map((c) => c.did);
    if (targets.length === 0) return;

    setBulkBusy(true);
    setStatusNote(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_dids", dids: targets }),
      });
      const data = (await res.json()) as { importedCount?: number };
      if (res.ok) {
        setStatusNote(
          `Followed ${data.importedCount ?? targets.length} Bluesky ${
            (data.importedCount ?? targets.length) === 1 ? "friend" : "friends"
          }!`
        );
        await handleScanBluesky();
        router.refresh();
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleToggleAutoImport() {
    const nextVal = !autoImport;
    setToggleBusy(true);
    setStatusNote(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_auto_import", enabled: nextVal }),
      });
      const data = (await res.json()) as { importedCount?: number };
      if (res.ok) {
        setAutoImport(nextVal);
        if (nextVal) {
          setStatusNote(
            `Auto-import enabled! ${
              data.importedCount
                ? `Also followed ${data.importedCount} Bluesky friends already on Give a Thing.`
                : "New Bluesky friends who join Give a Thing will be followed automatically."
            }`
          );
          await handleScanBluesky();
        }
        router.refresh();
      }
    } finally {
      setToggleBusy(false);
    }
  }

  const tabOrder: NetworkTabKey[] = ["following", "followers", "mutuals"];

  function selectAndFocusTab(nextTab: NetworkTabKey) {
    setActiveTab(nextTab);
    const btn = tabRefs[nextTab].current;
    btn?.focus();
    btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleTabListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabOrder.indexOf(activeTab);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      selectAndFocusTab(tabOrder[(idx + 1) % tabOrder.length]!);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      selectAndFocusTab(
        tabOrder[(idx - 1 + tabOrder.length) % tabOrder.length]!
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAndFocusTab(tabOrder[0]!);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAndFocusTab(tabOrder[tabOrder.length - 1]!);
    }
  }

  function filterCandidates(list: BskyCandidate[]): BskyCandidate[] {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, "");
    if (!q) return list;
    return list.filter(
      (c) =>
        c.handle.toLowerCase().includes(q) ||
        (c.displayName?.toLowerCase().includes(q) ?? false)
    );
  }

  const tabMeta: Array<{
    key: NetworkTabKey;
    label: string;
    emptyText: string;
    iconColor: string;
  }> = [
    {
      key: "following",
      label: "Following",
      emptyText:
        "None of the people you follow on Bluesky have joined Give a Thing yet—give a thing to a friend to send them a 24h Bluesky invite!",
      iconColor: "text-[#8ec8ff]",
    },
    {
      key: "followers",
      label: "Followers",
      emptyText:
        "None of your Bluesky followers have joined Give a Thing yet!",
      iconColor: "text-[#ff99ac]",
    },
    {
      key: "mutuals",
      label: "Mutuals",
      emptyText:
        "None of your Bluesky mutuals have joined Give a Thing yet!",
      iconColor: "text-[#ffd15c]",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Back to YOUR THINGS */}
      <div>
        <Link
          href={`/u/${encodeURIComponent(viewerHandle)}`}
          className="rpg-btn-secondary inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-[#ffd15c]" aria-hidden="true" />
          Back to Your Things
        </Link>
      </div>

      {/* Main FIND MY FRIENDS Panel */}
      <section className="rpg-panel p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <h1 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
              FIND MY FRIENDS
            </h1>
            <p className="text-sm text-[#cfc3e8]">
              Search Bluesky friends across your <strong>Following</strong>,{" "}
              <strong>Followers</strong>, and <strong>Mutuals</strong>—or look
              up any Bluesky handle directly!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={scanning}
              onClick={() => void handleScanBluesky()}
              className="rpg-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 font-pixel text-[10px]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#8ec8ff] ${
                  scanning ? "animate-spin" : ""
                }`}
                aria-hidden="true"
              />
              {scanning ? "Scanning Bluesky..." : "Rescan Bluesky"}
            </button>

            <button
              type="button"
              disabled={toggleBusy}
              onClick={handleToggleAutoImport}
              aria-pressed={autoImport}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-pixel text-[10px] ${
                autoImport
                  ? "rpg-btn-blue"
                  : "rpg-btn-secondary text-[#cfc3e8]"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Auto-Follow Joining Friends: {autoImport ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <label htmlFor={searchInputId} className="sr-only">
            Search Bluesky friends by handle or name
          </label>
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#8ec8ff]"
              aria-hidden="true"
            />
            <input
              id={searchInputId}
              type="search"
              placeholder="Filter your tabs or search any @handle on Bluesky..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rpg-slot w-full pl-10 pr-4 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
            />
          </div>
        </div>

        {statusNote && (
          <p className="rounded border border-[#4be3a0]/50 bg-[#4be3a0]/10 px-3.5 py-2 text-xs text-[#4be3a0]">
            {statusNote}
          </p>
        )}

        {/* Three Accessible Search Tabs: Following, Followers, Mutuals */}
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label="Bluesky friend lists"
            onKeyDown={handleTabListKeyDown}
            className="rpg-tablist"
          >
            {tabMeta.map((t) => {
              const count = network ? network[t.key].length : 0;
              const selected = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  ref={tabRefs[t.key]}
                  id={tabIds[t.key]}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={(e) => {
                    setActiveTab(t.key);
                    e.currentTarget.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                    });
                  }}
                  className="rpg-tab inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
                >
                  {t.key === "mutuals" ? (
                    <HeartHandshake
                      className={`h-3.5 w-3.5 ${t.iconColor}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <Users
                      className={`h-3.5 w-3.5 ${t.iconColor}`}
                      aria-hidden="true"
                    />
                  )}
                  <span>{t.label}</span>
                  {network && (
                    <span className="rounded bg-[#160f24] px-1.5 py-0.5 text-[10px] text-[#ffd15c]">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {tabMeta.map((t) => {
            const selected = activeTab === t.key;
            const rawList = network ? network[t.key] : [];
            const filtered = filterCandidates(rawList);
            const unfollowedCount = rawList.filter(
              (c) => !followedDidSet.has(c.did)
            ).length;

            return (
              <div
                key={t.key}
                role="tabpanel"
                aria-labelledby={tabIds[t.key]}
                hidden={!selected}
              >
                <div className="space-y-3 pt-1">
                  {scanning && !network ? (
                    <div className="rpg-slot p-6 text-center text-xs text-[#cfc3e8]">
                      Scanning your Bluesky {t.label.toLowerCase()} for Give a
                      Thing players...
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-pixel text-xs text-[#8ec8ff]">
                          Bluesky {t.label} on Give a Thing ({filtered.length}
                          {searchQuery.trim() ? ` of ${rawList.length}` : ""})
                        </p>

                        {unfollowedCount > 0 && (
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => void handleFollowAllInTab(t.key)}
                            className="rpg-btn-red inline-flex items-center gap-1.5 px-3.5 py-1.5 font-pixel text-[10px]"
                          >
                            <UserPlus
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {bulkBusy
                              ? "Following..."
                              : `Follow All (${unfollowedCount})`}
                          </button>
                        )}
                      </div>

                      {filtered.length === 0 ? (
                        <div className="rpg-slot p-5 text-center text-xs text-[#cfc3e8]">
                          {searchQuery.trim()
                            ? `No matches for "${searchQuery.trim()}" in your Bluesky ${t.label.toLowerCase()} on Give a Thing.`
                            : t.emptyText}
                        </div>
                      ) : (
                        <ul className="grid gap-2.5 sm:grid-cols-2">
                          {filtered.map((person) => {
                            const isFollowed = followedDidSet.has(person.did);
                            return (
                              <li
                                key={person.did}
                                className="rpg-slot flex items-center justify-between gap-2 p-2.5"
                              >
                                <Link
                                  href={`/u/${encodeURIComponent(person.handle)}`}
                                  className="flex items-center gap-2.5 min-w-0 hover:text-[#ffd15c]"
                                >
                                  {person.avatarUrl ? (
                                    <img
                                      src={person.avatarUrl}
                                      alt=""
                                      className="h-9 w-9 shrink-0 rounded-sm object-cover"
                                    />
                                  ) : (
                                    <div className="h-9 w-9 shrink-0 rounded-sm bg-[#3c2b60]" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-[#fdf6e9]">
                                      {person.displayName ||
                                        `@${person.handle}`}
                                    </p>
                                    <p className="truncate text-[11px] text-[#8ec8ff]">
                                      @{person.handle}
                                    </p>
                                  </div>
                                </Link>

                                {isFollowed ? (
                                  <button
                                    type="button"
                                    disabled={personBusyDid === person.did}
                                    onClick={() =>
                                      void handleUnfollow(person.did)
                                    }
                                    className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] text-[#4be3a0]"
                                  >
                                    <UserCheck
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Following
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={personBusyDid === person.did}
                                    onClick={() =>
                                      void handleFollowPerson(person)
                                    }
                                    className="rpg-btn-blue inline-flex items-center gap-1 px-3 py-1.5 font-pixel text-[10px]"
                                  >
                                    <UserPlus
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Follow
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Bluesky Directory Lookup Results when typing */}
        {searchQuery.trim().length >= 2 && (
          <div className="border-t-2 border-[#9e762a]/40 pt-4 space-y-2.5">
            <h2 className="font-pixel text-xs text-[#ffd15c]">
              Bluesky Directory Search for &ldquo;{searchQuery.trim()}&rdquo;
            </h2>

            {globalSearching && globalActors.length === 0 ? (
              <p className="text-xs text-[#cfc3e8]">Searching Bluesky...</p>
            ) : globalActors.length === 0 ? (
              <p className="text-xs text-[#cfc3e8]">
                No Bluesky accounts found matching that search.
              </p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {globalActors.map((actor) => {
                  const isFollowed = followedDidSet.has(actor.did);
                  return (
                    <li
                      key={actor.did}
                      className="rpg-slot flex items-center justify-between gap-2 p-2.5"
                    >
                      {actor.isRegisteredPlayer ? (
                        <Link
                          href={`/u/${encodeURIComponent(actor.handle)}`}
                          className="flex items-center gap-2.5 min-w-0 hover:text-[#ffd15c]"
                        >
                          {actor.avatarUrl ? (
                            <img
                              src={actor.avatarUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-sm object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded-sm bg-[#3c2b60]" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#fdf6e9]">
                              {actor.displayName || `@${actor.handle}`}
                            </p>
                            <p className="truncate text-[11px] text-[#4be3a0]">
                              @{actor.handle} &bull; On Give a Thing
                            </p>
                          </div>
                        </Link>
                      ) : (
                        <a
                          href={`https://bsky.app/profile/${encodeURIComponent(actor.handle)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 min-w-0 hover:text-[#8ec8ff]"
                        >
                          {actor.avatarUrl ? (
                            <img
                              src={actor.avatarUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-sm object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded-sm bg-[#3c2b60]" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#fdf6e9]">
                              {actor.displayName || `@${actor.handle}`}
                            </p>
                            <p className="truncate text-[11px] text-[#cfc3e8]">
                              @{actor.handle} &bull; Not joined yet
                            </p>
                          </div>
                        </a>
                      )}

                      {actor.isRegisteredPlayer ? (
                        isFollowed ? (
                          <button
                            type="button"
                            disabled={personBusyDid === actor.did}
                            onClick={() => void handleUnfollow(actor.did)}
                            className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1 font-pixel text-[10px] text-[#4be3a0]"
                          >
                            <UserCheck
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            Following
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={personBusyDid === actor.did}
                            onClick={() => void handleFollowPerson(actor)}
                            className="rpg-btn-blue inline-flex items-center gap-1 px-2.5 py-1 font-pixel text-[10px]"
                          >
                            <UserPlus className="h-3 w-3" aria-hidden="true" />
                            Follow
                          </button>
                        )
                      ) : (
                        <a
                          href={`https://bsky.app/profile/${encodeURIComponent(actor.handle)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-[#160f24] px-2 py-1 font-pixel text-[9px] text-[#8ec8ff] hover:underline"
                        >
                          Bluesky
                          <ExternalLink
                            className="h-2.5 w-2.5"
                            aria-hidden="true"
                          />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Current Give a Thing Following List */}
      <section className="rpg-panel-subtle p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#ffd15c]" aria-hidden="true" />
          <h2 className="font-pixel text-xs sm:text-sm text-[#ffd15c]">
            FRIENDS YOU FOLLOW ON GIVE A THING ({following.length})
          </h2>
        </div>

        {following.length === 0 ? (
          <p className="text-sm text-[#cfc3e8]">
            You aren&apos;t following anyone on Give a Thing yet. Check the
            Following, Followers, and Mutuals tabs above to follow your Bluesky
            friends!
          </p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {following.map((f) => (
              <li
                key={f.did}
                className="rpg-slot flex items-center justify-between gap-2 p-3"
              >
                <Link
                  href={`/u/${encodeURIComponent(f.handle)}`}
                  className="flex items-center gap-2.5 min-w-0 hover:text-[#ffd15c]"
                >
                  {f.avatarUrl ? (
                    <img
                      src={f.avatarUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded-sm bg-[#3c2b60]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#fdf6e9]">
                      {f.displayName || `@${f.handle}`}
                    </p>
                    <p className="truncate text-xs text-[#8ec8ff]">
                      @{f.handle}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  disabled={personBusyDid === f.did}
                  onClick={() => void handleUnfollow(f.did)}
                  className="rpg-btn-secondary px-2.5 py-1 font-pixel text-[10px] text-[#cfc3e8] hover:text-[#ff99ac]"
                >
                  Unfollow
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
