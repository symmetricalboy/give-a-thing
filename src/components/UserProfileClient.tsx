"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  RotateCcw,
  Search,
  Send,
  Star,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { ProfileSocialUser, ThingCardItem } from "@/lib/queries";
import { RpgModal } from "./RpgModal";
import { ThingGridCard } from "./ThingGridCard";
import { GiveThingModal } from "./GiveThingModal";

export interface OutgoingEscrowItem {
  offerTid: string;
  thingTid: string;
  thingName: string;
  catalogNumber: number;
  iconUrl: string;
  recipientDid: string;
  recipientHandle: string;
  note: string | null;
  createdAtIso: string;
  revocableAfterIso: string;
  isRevocableNow: boolean;
  claimUrl: string;
  composerIntentUrl: string;
}

interface UserProfileClientProps {
  playerDid: string;
  playerHandle: string;
  viewerDid: string | null;
  initialIsFollowing: boolean;
  followingCount: number;
  followersCount: number;
  followingList: ProfileSocialUser[];
  followersList: ProfileSocialUser[];
  topThings: Array<ThingCardItem & { favoriteSlot: number }>;
  inventory: ThingCardItem[];
  outgoingEscrows: OutgoingEscrowItem[];
}

export function UserProfileClient({
  playerDid,
  playerHandle,
  viewerDid,
  initialIsFollowing,
  followingCount,
  followersCount,
  followingList,
  followersList,
  topThings,
  inventory,
  outgoingEscrows,
}: UserProfileClientProps) {
  const router = useRouter();
  const isSelf = viewerDid === playerDid;

  const [following, setFollowing] = useState(initialIsFollowing);
  const [followBusy, setFollowBusy] = useState(false);
  const [listModal, setListModal] = useState<"followers" | "following" | null>(
    null
  );
  const [socialFollowingMap, setSocialFollowingMap] = useState<
    Record<string, boolean>
  >(() => {
    const m: Record<string, boolean> = {};
    for (const u of [...followingList, ...followersList]) {
      m[u.did] = u.viewerFollows;
    }
    return m;
  });
  const [socialBusyDid, setSocialBusyDid] = useState<string | null>(null);

  const [giveTarget, setGiveTarget] = useState<ThingCardItem | null>(null);
  const [favBusyTid, setFavBusyTid] = useState<string | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedOffer, setCopiedOffer] = useState<string | null>(null);
  const [revokingTid, setRevokingTid] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(initialIsFollowing);
  }, [initialIsFollowing]);

  useEffect(() => {
    const m: Record<string, boolean> = {};
    for (const u of [...followingList, ...followersList]) {
      m[u.did] = u.viewerFollows;
    }
    setSocialFollowingMap(m);
  }, [followingList, followersList]);

  useEffect(() => {
    if (!isSelf || outgoingEscrows.length === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isSelf, outgoingEscrows.length]);

  async function toggleFollow() {
    setFollowBusy(true);
    try {
      const action = following ? "unfollow" : "follow";
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          subjectDid: playerDid,
          source: "manual",
        }),
      });
      if (res.ok) {
        setFollowing(!following);
        router.refresh();
      }
    } finally {
      setFollowBusy(false);
    }
  }

  async function toggleModalPersonFollow(targetDid: string) {
    const currentlyFollows = Boolean(socialFollowingMap[targetDid]);
    setSocialBusyDid(targetDid);
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
        setSocialFollowingMap((prev) => ({
          ...prev,
          [targetDid]: !currentlyFollows,
        }));
        router.refresh();
      }
    } finally {
      setSocialBusyDid(null);
    }
  }

  async function handleToggleFavorite(item: ThingCardItem) {
    setFavBusyTid(item.thingTid);
    setFavError(null);
    try {
      const res = await fetch("/api/profile/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", thingTid: item.thingTid }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFavError(data.error ?? "Could not update Top 8.");
      } else {
        router.refresh();
      }
    } finally {
      setFavBusyTid(null);
    }
  }

  async function handleReorderFavorite(
    thingTid: string,
    direction: "left" | "right"
  ) {
    setFavBusyTid(thingTid);
    setFavError(null);
    try {
      const res = await fetch("/api/profile/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", thingTid, direction }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setFavBusyTid(null);
    }
  }

  async function handleRevoke(offerTid: string) {
    setRevokingTid(offerTid);
    try {
      const res = await fetch(`/api/offers/${offerTid}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setRevokingTid(null);
    }
  }

  const activeSocialList =
    listModal === "followers" ? followersList : followingList;

  return (
    <div className="space-y-8">
      {/* Friends & Connections Bar (Followers / Following Counters + FIND MY FRIENDS) */}
      <section
        aria-label="Friends and Connections"
        className="rpg-panel-blue p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setListModal("followers")}
              className="rpg-btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs"
            >
              <Users className="h-3.5 w-3.5 text-[#ff99ac]" aria-hidden="true" />
              <span className="font-pixel text-[#ffd15c]">
                {followersCount}
              </span>
              <span>{followersCount === 1 ? "Follower" : "Followers"}</span>
            </button>

            <button
              type="button"
              onClick={() => setListModal("following")}
              className="rpg-btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs"
            >
              <Users className="h-3.5 w-3.5 text-[#8ec8ff]" aria-hidden="true" />
              <span className="font-pixel text-[#ffd15c]">
                {followingCount}
              </span>
              <span>Following</span>
            </button>

            {viewerDid && (
              <Link
                href="/friends"
                className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                FIND MY FRIENDS
              </Link>
            )}
          </div>

          {viewerDid && !isSelf && (
            <button
              type="button"
              disabled={followBusy}
              onClick={toggleFollow}
              className={`inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs ${
                following
                  ? "rpg-btn-secondary text-[#4be3a0]"
                  : "rpg-btn-red"
              }`}
            >
              {following ? (
                <>
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Following @{playerHandle}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Follow @{playerHandle}
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {favError && (
        <p
          role="alert"
          className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-4 py-2.5 text-xs text-[#ff99ac]"
        >
          {favError}
        </p>
      )}

      {/* Featured Top 8 Things Showcase */}
      {(topThings.length > 0 || (isSelf && inventory.length > 0)) && (
        <section
          aria-label="Featured Top 8 Things"
          className="rpg-panel p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#9e762a]/50 pb-3">
            <div className="flex items-center gap-2">
              <Star
                className="h-4 w-4 fill-[#ffd15c] text-[#ffd15c]"
                aria-hidden="true"
              />
              <h2 className="font-pixel text-xs sm:text-sm text-[#ffd15c]">
                @{playerHandle.toUpperCase()}&apos;S TOP 8 THINGS (
                {topThings.length}/8)
              </h2>
            </div>
            {isSelf && (
              <span className="text-xs text-[#cfc3e8]">
                Click &ldquo;Top 8&rdquo; on any thing you own below to feature
                up to 8 favorites here
              </span>
            )}
          </div>

          {topThings.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#cfc3e8]">
              You haven&apos;t picked your Top 8 things yet! Click{" "}
              <strong>Top 8</strong> on any of your things below to pin them to
              the top of your profile.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {topThings.map((item, idx) => (
                <div
                  key={item.thingTid}
                  className="rpg-slot flex flex-col justify-between p-3 border-[#ffd15c]/60"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="rounded bg-[#ff4d6d] px-1.5 py-0.5 font-pixel text-[9px] text-[#24040b]">
                        #{idx + 1}
                      </span>
                      <span className="font-pixel text-[9px] text-[#8ec8ff]">
                        #{String(item.catalogNumber).padStart(4, "0")}
                      </span>
                    </div>

                    <Link
                      href={`/thing/${item.thingTid}`}
                      className="mx-auto my-2 flex h-20 w-20 items-center justify-center"
                    >
                      <img
                        src={item.iconUrl}
                        alt={item.iconAlt}
                        width={72}
                        height={72}
                        className="pixel-art h-18 w-18 object-contain transition-transform hover:scale-105"
                      />
                    </Link>

                    <Link
                      href={`/thing/${item.thingTid}`}
                      className="block text-center text-xs font-semibold leading-snug text-[#fdf6e9] hover:text-[#ffd15c] line-clamp-2"
                    >
                      {item.name}
                    </Link>
                  </div>

                  {isSelf && (
                    <div className="mt-3 flex items-center justify-between gap-1 border-t border-[#9e762a]/40 pt-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0 || favBusyTid === item.thingTid}
                          onClick={() =>
                            void handleReorderFavorite(item.thingTid, "left")
                          }
                          aria-label="Move earlier in Top 8"
                          className="rpg-btn-secondary inline-flex h-6 w-6 items-center justify-center"
                        >
                          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={
                            idx === topThings.length - 1 ||
                            favBusyTid === item.thingTid
                          }
                          onClick={() =>
                            void handleReorderFavorite(item.thingTid, "right")
                          }
                          aria-label="Move later in Top 8"
                          className="rpg-btn-secondary inline-flex h-6 w-6 items-center justify-center"
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={favBusyTid === item.thingTid}
                          onClick={() => void handleToggleFavorite(item)}
                          aria-label="Remove from Top 8"
                          title="Remove from Top 8"
                          className="rpg-btn-secondary inline-flex h-6 w-6 items-center justify-center text-[#ffd15c]"
                        >
                          <Star
                            className="h-3 w-3 fill-current"
                            aria-hidden="true"
                          />
                        </button>
                        {item.status === "held" && (
                          <button
                            type="button"
                            onClick={() => setGiveTarget(item)}
                            aria-label="Give away this thing"
                            title="Give away"
                            className="rpg-btn-red inline-flex h-6 items-center px-1.5 font-pixel text-[9px]"
                          >
                            <Send className="h-2.5 w-2.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Outgoing Escrowed Offers (Visible to Owner) */}
      {isSelf && outgoingEscrows.length > 0 && (
        <section
          aria-label="Set-Aside Escrow Gifts"
          className="rpg-panel-blue p-5 space-y-3"
        >
          <h2 className="font-pixel text-xs sm:text-sm text-[#8ec8ff]">
            THINGS SET ASIDE FOR FRIENDS ({outgoingEscrows.length})
          </h2>
          <p className="text-xs text-[#cfc3e8]">
            These things are set aside awaiting your friend&apos;s Bluesky
            sign-in. Once an offer goes unclaimed for over 24 hours, you can
            return it to your active collection.
          </p>

          <div className="space-y-2.5">
            {outgoingEscrows.map((offer) => {
              const revocableMs = new Date(offer.revocableAfterIso).getTime();
              const unlocked = nowMs >= revocableMs;
              const remSec = Math.max(
                0,
                Math.floor((revocableMs - nowMs) / 1000)
              );
              const remHours = Math.floor(remSec / 3600);
              const remMins = Math.floor((remSec % 3600) / 60);

              return (
                <div
                  key={offer.offerTid}
                  className="flex flex-wrap items-center justify-between gap-3 rounded bg-[#160f24] p-3 border border-[#4da6ff]/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      href={`/thing/${offer.thingTid}`}
                      className="rpg-slot flex h-12 w-12 shrink-0 items-center justify-center p-1"
                    >
                      <img
                        src={offer.iconUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="pixel-art h-10 w-10 object-contain"
                      />
                    </Link>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#fdf6e9]">
                        #{String(offer.catalogNumber).padStart(4, "0")}{" "}
                        {offer.thingName}
                      </p>
                      <p className="text-xs text-[#8ec8ff]">
                        Reserved for @{offer.recipientHandle}{" "}
                        {!unlocked && (
                          <span className="text-[#cfc3e8]">
                            ({remHours}h {remMins}m left in 24h window)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={offer.composerIntentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rpg-btn-blue inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px]"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      Mention on Bluesky
                    </a>

                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(offer.claimUrl);
                        setCopiedOffer(offer.offerTid);
                        setTimeout(() => setCopiedOffer(null), 2000);
                      }}
                      className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px]"
                    >
                      {copiedOffer === offer.offerTid ? (
                        <>
                          <Check className="h-3 w-3 text-[#4be3a0]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Link
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!unlocked || revokingTid === offer.offerTid}
                      onClick={() => void handleRevoke(offer.offerTid)}
                      className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] text-[#ff99ac]"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {revokingTid === offer.offerTid
                        ? "Returning..."
                        : unlocked
                          ? "Return Thing"
                          : "Locked <24h"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Full Owned Things Grid */}
      <section aria-label="All Owned Things" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pixel text-xs sm:text-sm text-[#ffd15c]">
            ALL THINGS OWNED ({inventory.length})
          </h2>
          {isSelf && inventory.length > 0 && (
            <span className="text-xs text-[#cfc3e8]">
              Give any thing to a friend anytime!
            </span>
          )}
        </div>

        {inventory.length === 0 ? (
          <div className="rpg-panel-subtle p-10 text-center space-y-2">
            <p className="font-pixel text-xs text-[#ffd15c]">
              No Things Owned Right Now!
            </p>
            <p className="text-sm text-[#cfc3e8]">
              {isSelf ? (
                <>
                  Head over to{" "}
                  <Link href="/get" className="text-[#ff99ac] underline">
                    GET A THING
                  </Link>{" "}
                  to unwrap today&apos;s pointless thing!
                </>
              ) : (
                `@${playerHandle} has given away all their things (or hasn't pulled today yet).`
              )}
            </p>
          </div>
        ) : (
          <div className="thing-grid">
            {inventory.map((item) => (
              <ThingGridCard
                key={item.thingTid}
                item={item}
                isViewerOwner={isSelf}
                onGiveClick={(selected) => setGiveTarget(selected)}
                onToggleFavorite={
                  isSelf
                    ? (selected) => void handleToggleFavorite(selected)
                    : undefined
                }
                favoriteBusy={favBusyTid === item.thingTid}
              />
            ))}
          </div>
        )}
      </section>

      {/* Followers / Following User List Modal */}
      <RpgModal
        open={listModal !== null}
        onClose={() => setListModal(null)}
        title={
          listModal === "followers"
            ? `@${playerHandle}'s Followers (${followersCount})`
            : `People @${playerHandle} Follows (${followingCount})`
        }
      >
        <div className="space-y-3">
          {activeSocialList.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-[#cfc3e8]">
                {listModal === "followers"
                  ? `@${playerHandle} doesn't have any followers on Give a Thing yet.`
                  : `@${playerHandle} isn't following anyone on Give a Thing yet.`}
              </p>
              {isSelf && (
                <Link
                  href="/friends"
                  onClick={() => setListModal(null)}
                  className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  FIND MY FRIENDS
                </Link>
              )}
            </div>
          ) : (
            <ul className="scroll-region max-h-96 space-y-2 pr-1">
              {activeSocialList.map((person) => {
                const viewerFollowsPerson = Boolean(
                  socialFollowingMap[person.did]
                );
                const isViewerSelf = viewerDid === person.did;

                return (
                  <li
                    key={person.did}
                    className="rpg-slot flex items-center justify-between gap-2.5 p-2.5"
                  >
                    <Link
                      href={`/u/${encodeURIComponent(person.handle)}`}
                      onClick={() => setListModal(null)}
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
                        <p className="truncate text-xs sm:text-sm font-semibold text-[#fdf6e9]">
                          {person.displayName || `@${person.handle}`}
                        </p>
                        <p className="truncate text-[11px] text-[#8ec8ff]">
                          @{person.handle}
                        </p>
                      </div>
                    </Link>

                    {viewerDid && !isViewerSelf && (
                      <button
                        type="button"
                        disabled={socialBusyDid === person.did}
                        onClick={() => void toggleModalPersonFollow(person.did)}
                        className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] ${
                          viewerFollowsPerson
                            ? "rpg-btn-secondary text-[#4be3a0]"
                            : "rpg-btn-blue"
                        }`}
                      >
                        {viewerFollowsPerson ? (
                          <>
                            <UserCheck
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3 w-3" aria-hidden="true" />
                            Follow
                          </>
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </RpgModal>

      <GiveThingModal
        open={Boolean(giveTarget)}
        onClose={() => setGiveTarget(null)}
        thing={giveTarget}
      />
    </div>
  );
}
