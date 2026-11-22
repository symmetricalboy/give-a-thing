"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles, UserCheck, UserPlus, Users } from "lucide-react";

interface FriendItem {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface BskyCandidate extends FriendItem {
  alreadyFollowing: boolean;
}

interface FriendsManagerProps {
  initialAutoImport: boolean;
  initialFollowing: FriendItem[];
}

export function FriendsManager({
  initialAutoImport,
  initialFollowing,
}: FriendsManagerProps) {
  const router = useRouter();
  const [autoImport, setAutoImport] = useState(initialAutoImport);
  const [following, setFollowing] = useState<FriendItem[]>(initialFollowing);
  const [candidates, setCandidates] = useState<BskyCandidate[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  async function handleScanBluesky() {
    setScanning(true);
    setStatusNote(null);
    try {
      const res = await fetch("/api/friends?scanBsky=1");
      if (!res.ok) return;
      const data = (await res.json()) as {
        following: FriendItem[];
        bskyCandidates: BskyCandidate[];
      };
      setFollowing(data.following);
      setCandidates(data.bskyCandidates);
    } finally {
      setScanning(false);
    }
  }

  async function handleSingleFollow(person: BskyCandidate) {
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
      setCandidates((prev) =>
        prev
          ? prev.map((c) =>
              c.did === person.did ? { ...c, alreadyFollowing: true } : c
            )
          : null
      );
      setFollowing((prev) =>
        prev.some((f) => f.did === person.did) ? prev : [person, ...prev]
      );
      router.refresh();
    }
  }

  async function handleUnfollow(did: string) {
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unfollow", subjectDid: did }),
    });
    if (res.ok) {
      setFollowing((prev) => prev.filter((f) => f.did !== did));
      setCandidates((prev) =>
        prev
          ? prev.map((c) =>
              c.did === did ? { ...c, alreadyFollowing: false } : c
            )
          : null
      );
      router.refresh();
    }
  }

  async function handleImportAll() {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_all_bsky" }),
      });
      const data = (await res.json()) as { importedCount?: number };
      if (res.ok) {
        setStatusNote(
          `Imported ${data.importedCount ?? 0} Bluesky ${
            data.importedCount === 1 ? "friend" : "friends"
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
                ? `Also synced ${data.importedCount} existing Bluesky friends.`
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

  const unfollowedCount =
    candidates?.filter((c) => !c.alreadyFollowing).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Bluesky Sync & Auto-Import Card */}
      <section className="rpg-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <h1 className="font-pixel text-sm sm:text-base text-[#f5c451]">
              BLUESKY FRIEND SYNC
            </h1>
            <p className="text-sm text-[#bfb2d6]">
              Find people you follow on Bluesky who are already trading things
              on Give a Thing—or turn on Auto-Import so friends are added to
              your Following feed automatically as they join!
            </p>
          </div>

          <button
            type="button"
            disabled={toggleBusy}
            onClick={handleToggleAutoImport}
            aria-pressed={autoImport}
            className={`inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs ${
              autoImport
                ? "border-2 border-[#4be3a0] bg-[#4be3a0]/20 text-[#4be3a0]"
                : "rpg-btn-secondary text-[#bfb2d6]"
            }`}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Auto-Import As Friends Join: {autoImport ? "ON" : "OFF"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={scanning}
            onClick={handleScanBluesky}
            className="rpg-btn-primary inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {scanning
              ? "Scanning Bluesky Follows..."
              : "Scan My Bluesky Follows"}
          </button>

          {unfollowedCount > 0 && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleImportAll}
              className="rpg-btn-secondary inline-flex items-center gap-2 border-[#4be3a0] px-4 py-2.5 font-pixel text-xs text-[#4be3a0]"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              {bulkBusy
                ? "Importing..."
                : `Follow All (${unfollowedCount}) Friends`}
            </button>
          )}
        </div>

        {statusNote && (
          <p className="rounded border border-[#4be3a0]/50 bg-[#4be3a0]/10 px-3.5 py-2 text-xs text-[#4be3a0]">
            {statusNote}
          </p>
        )}

        {candidates !== null && (
          <div className="border-t border-[#8c6826]/40 pt-4 space-y-2.5">
            <h2 className="font-pixel text-xs text-[#e5b54f]">
              Bluesky Follows on Give a Thing ({candidates.length})
            </h2>
            {candidates.length === 0 ? (
              <p className="text-xs text-[#bfb2d6]">
                None of your Bluesky follows have joined Give a Thing yet—set
                aside one of your things for a friend to invite them!
              </p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {candidates.map((person) => (
                  <li
                    key={person.did}
                    className="rpg-slot flex items-center justify-between gap-2 p-2.5"
                  >
                    <Link
                      href={`/u/${encodeURIComponent(person.handle)}`}
                      className="flex items-center gap-2.5 min-w-0"
                    >
                      {person.avatarUrl ? (
                        <img
                          src={person.avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-sm object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-sm bg-[#33274a]" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#fbf4e4]">
                          {person.displayName || `@${person.handle}`}
                        </p>
                        <p className="truncate text-[11px] text-[#bfb2d6]">
                          @{person.handle}
                        </p>
                      </div>
                    </Link>

                    {person.alreadyFollowing ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 font-pixel text-[10px] text-[#4be3a0]">
                        <UserCheck className="h-3.5 w-3.5" />
                        Following
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSingleFollow(person)}
                        className="rpg-btn-primary inline-flex items-center gap-1 px-3 py-1.5 font-pixel text-[10px]"
                      >
                        <UserPlus className="h-3 w-3" aria-hidden="true" />
                        Follow
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Current Following List */}
      <section className="rpg-panel-subtle p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#f5c451]" aria-hidden="true" />
          <h2 className="font-pixel text-xs sm:text-sm text-[#f5c451]">
            PEOPLE YOU FOLLOW ({following.length})
          </h2>
        </div>

        {following.length === 0 ? (
          <p className="text-sm text-[#bfb2d6]">
            You aren&apos;t following anyone yet. Scan your Bluesky follows
            above or click into any player&apos;s profile from the Global Feed!
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
                  className="flex items-center gap-2.5 min-w-0 hover:text-[#f5c451]"
                >
                  {f.avatarUrl ? (
                    <img
                      src={f.avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-sm object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-sm bg-[#33274a]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#fbf4e4]">
                      {f.displayName || `@${f.handle}`}
                    </p>
                    <p className="truncate text-xs text-[#bfb2d6]">
                      @{f.handle}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => void handleUnfollow(f.did)}
                  className="rpg-btn-secondary px-2.5 py-1 font-pixel text-[10px] text-[#bfb2d6] hover:text-[#ff9bb6]"
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
