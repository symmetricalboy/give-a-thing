"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Gift,
  Hammer,
  Loader2,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  Sparkles,
  Star,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  ProfileMysteryBoxCollection,
  ProfileSocialUser,
  ThingCardItem,
} from "@/lib/queries";
import { formatUsdCents } from "@/lib/stripe/pricing";
import { RpgModal } from "./RpgModal";
import { ThingGridCard } from "./ThingGridCard";
import { GiveThingModal, type GiveableThingSummary } from "./GiveThingModal";

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

interface ClaimedCollectionThingView {
  thingTid: string;
  catalogNumber: number;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  flavorText: string;
  uselessTrait: string;
  iconUrl: string;
  iconAlt: string;
}

function formatUtcCountdown(targetIso: string, nowMs: number): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

interface UserProfileClientProps {
  playerDid: string;
  playerHandle: string;
  viewerDid: string | null;
  viewerUnlimitedPulls: boolean;
  nextPullUtcIso: string;
  activeCollections: ProfileMysteryBoxCollection[];
  initialIsFollowing: boolean;
  heldCount: number;
  discoveredCount: number;
  createdCount: number;
  givenAwayCount: number;
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
  viewerUnlimitedPulls,
  nextPullUtcIso,
  activeCollections,
  initialIsFollowing,
  heldCount,
  discoveredCount,
  createdCount,
  givenAwayCount,
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

  const [giveTarget, setGiveTarget] = useState<GiveableThingSummary | null>(
    null
  );
  const [favBusyTid, setFavBusyTid] = useState<string | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedOffer, setCopiedOffer] = useState<string | null>(null);
  const [revokingTid, setRevokingTid] = useState<string | null>(null);

  // Mystery Box Collection draw & paid checkout states
  const [mysteryBoxes, setMysteryBoxes] =
    useState<ProfileMysteryBoxCollection[]>(activeCollections);
  const [claimingBoxTid, setClaimingBoxTid] = useState<string | null>(null);
  const [fulfillingCheckout, setFulfillingCheckout] = useState(false);
  const [checkoutBannerError, setCheckoutBannerError] = useState<string | null>(
    null
  );
  const [boxErrors, setBoxErrors] = useState<Record<string, string>>({});
  const [unboxedByCollection, setUnboxedByCollection] = useState<
    Record<string, ClaimedCollectionThingView>
  >({});

  useEffect(() => {
    setMysteryBoxes(activeCollections);
  }, [activeCollections]);

  // Handle Stripe Checkout return (`?checkout_session_id=...`) or cancel (`?checkout_cancelled=...`)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("checkout_session_id");
    const cancelledPurchaseId = url.searchParams.get("checkout_cancelled");
    const collectionHint = url.searchParams.get("collection");

    if (!sessionId && !cancelledPurchaseId) return;

    url.searchParams.delete("checkout_session_id");
    url.searchParams.delete("checkout_cancelled");
    url.searchParams.delete("collection");
    window.history.replaceState({}, "", url.pathname + url.search);

    if (cancelledPurchaseId) {
      void fetch("/api/collections/checkout/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelPurchaseId: cancelledPurchaseId }),
      })
        .then(() => router.refresh())
        .catch(() => {});
      return;
    }

    if (sessionId) {
      setFulfillingCheckout(true);
      setCheckoutBannerError(null);
      void fetch("/api/collections/checkout/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: sessionId }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            ok?: boolean;
            error?: string;
            thing?: ClaimedCollectionThingView & {
              collectionTid: string;
              remainingCount: number;
            };
          };
          if (!res.ok || !data.thing) {
            setCheckoutBannerError(
              data.error ?? "Could not unwrap your purchased mystery thing."
            );
            return;
          }
          const resolvedTid =
            data.thing.collectionTid || collectionHint || "";
          if (resolvedTid) {
            setUnboxedByCollection((prev) => ({
              ...prev,
              [resolvedTid]: data.thing!,
            }));
            setMysteryBoxes((prev) => {
              const exists = prev.some((b) => b.collectionTid === resolvedTid);
              if (!exists) {
                return [
                  {
                    collectionTid: resolvedTid,
                    name: data.thing!.category,
                    description: null,
                    totalItems: 5,
                    priceCents: 0,
                    platformFeeBps: 0,
                    remainingCount: data.thing!.remainingCount,
                    viewerHasClaimedToday: false,
                    createdAtIso: new Date().toISOString(),
                  },
                  ...prev,
                ];
              }
              return prev.map((b) =>
                b.collectionTid === resolvedTid
                  ? {
                      ...b,
                      remainingCount: data.thing!.remainingCount,
                      viewerHasClaimedToday: false,
                    }
                  : b
              );
            });
          }
          router.refresh();
        })
        .catch(() => {
          setCheckoutBannerError(
            "Network error verifying your purchase—check YOUR THINGS in a moment!"
          );
        })
        .finally(() => {
          setFulfillingCheckout(false);
        });
    }
  }, [router]);

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

  const hasFreeMysteryBoxWithTimer =
    !isSelf && mysteryBoxes.some((b) => b.priceCents === 0 && b.remainingCount > 0);

  useEffect(() => {
    const needsClock =
      (isSelf && outgoingEscrows.length > 0) || hasFreeMysteryBoxWithTimer;
    if (!needsClock) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isSelf, outgoingEscrows.length, hasFreeMysteryBoxWithTimer]);

  async function handleBuyPaidMysteryBox(collectionTid: string) {
    setClaimingBoxTid(collectionTid);
    setBoxErrors((prev) => {
      const copy = { ...prev };
      delete copy[collectionTid];
      return copy;
    });

    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(collectionTid)}/checkout`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        checkoutUrl?: string;
        soldOut?: boolean;
        error?: string;
      };

      if (!res.ok || !data.checkoutUrl) {
        if (data.soldOut) {
          setMysteryBoxes((prev) =>
            prev.filter((b) => b.collectionTid !== collectionTid)
          );
        } else {
          setBoxErrors((prev) => ({
            ...prev,
            [collectionTid]:
              data.error ?? "Could not start checkout for this mystery box.",
          }));
        }
        setClaimingBoxTid(null);
        return;
      }

      window.location.assign(data.checkoutUrl);
    } catch {
      setBoxErrors((prev) => ({
        ...prev,
        [collectionTid]: "Network error reaching checkout.",
      }));
      setClaimingBoxTid(null);
    }
  }

  async function handleClaimMysteryBox(collectionTid: string) {
    setClaimingBoxTid(collectionTid);
    setBoxErrors((prev) => {
      const copy = { ...prev };
      delete copy[collectionTid];
      return copy;
    });

    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(collectionTid)}/claim`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        alreadyClaimedToday?: boolean;
        soldOut?: boolean;
        thing?: ClaimedCollectionThingView & {
          remainingCount: number;
          unlimitedPulls?: boolean;
        };
      };

      if (!res.ok || !data.thing) {
        if (data.alreadyClaimedToday) {
          setMysteryBoxes((prev) =>
            prev.map((b) =>
              b.collectionTid === collectionTid
                ? { ...b, viewerHasClaimedToday: true }
                : b
            )
          );
        } else if (data.soldOut) {
          // Depleted collections disappear immediately
          setMysteryBoxes((prev) =>
            prev.filter((b) => b.collectionTid !== collectionTid)
          );
        } else {
          setBoxErrors((prev) => ({
            ...prev,
            [collectionTid]:
              data.error ?? "Could not draw from this mystery box.",
          }));
        }
        return;
      }

      const drawn = data.thing;
      const isUnlim = Boolean(drawn.unlimitedPulls || viewerUnlimitedPulls);

      setUnboxedByCollection((prev) => ({
        ...prev,
        [collectionTid]: drawn,
      }));
      setMysteryBoxes((prev) =>
        prev.map((b) =>
          b.collectionTid === collectionTid
            ? {
                ...b,
                remainingCount: drawn.remainingCount,
                viewerHasClaimedToday: !isUnlim,
              }
            : b
        )
      );
      router.refresh();
    } catch {
      setBoxErrors((prev) => ({
        ...prev,
        [collectionTid]: "Network error reaching Give a Thing.",
      }));
    } finally {
      setClaimingBoxTid(null);
    }
  }

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
    <div className="space-y-6">
      {/* Friends & Connections Bar (Followers / Following Counters + Own FIND MY FRIENDS or Follow Button) */}
      <section
        aria-label="Friends and Connections"
        className="rpg-panel-blue p-5 sm:p-6"
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
          </div>

          {isSelf ? (
            <Link
              href="/friends"
              className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              FIND MY FRIENDS
            </Link>
          ) : viewerDid ? (
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
          ) : null}
        </div>
      </section>

      {/* Thing Counters Panel (Owned, Discovered, Created, Given Away) */}
      <section aria-label="Thing Statistics" className="rpg-panel p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rpg-slot flex flex-col items-center justify-center px-4 py-4 text-center border-[#4be3a0]/55">
            <span className="font-pixel text-xl sm:text-2xl text-[#4be3a0]">
              {heldCount}
            </span>
            <span className="mt-1 font-pixel text-[10px] sm:text-xs text-[#cfc3e8]">
              OWNED
            </span>
          </div>

          <div className="rpg-slot flex flex-col items-center justify-center px-4 py-4 text-center border-[#ffd15c]/55">
            <span className="font-pixel text-xl sm:text-2xl text-[#ffd15c]">
              {discoveredCount}
            </span>
            <span className="mt-1 font-pixel text-[10px] sm:text-xs text-[#cfc3e8]">
              DISCOVERED
            </span>
          </div>

          <div className="rpg-slot flex flex-col items-center justify-center px-4 py-4 text-center border-[#a87bff]/55">
            <span className="font-pixel text-xl sm:text-2xl text-[#c49bff]">
              {createdCount}
            </span>
            <span className="mt-1 font-pixel text-[10px] sm:text-xs text-[#cfc3e8]">
              CREATED
            </span>
          </div>

          <div className="rpg-slot flex flex-col items-center justify-center px-4 py-4 text-center border-[#ff4d6d]/55">
            <span className="font-pixel text-xl sm:text-2xl text-[#ff99ac]">
              {givenAwayCount}
            </span>
            <span className="mt-1 font-pixel text-[10px] sm:text-xs text-[#cfc3e8]">
              GIVEN AWAY
            </span>
          </div>
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

      {checkoutBannerError && (
        <p
          role="alert"
          className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-4 py-2.5 text-xs text-[#ff99ac]"
        >
          {checkoutBannerError}
        </p>
      )}

      {fulfillingCheckout && (
        <section className="rpg-panel-blue p-5 flex items-center justify-center gap-3 text-sm text-[#fdf6e9]">
          <Loader2
            className="h-4 w-4 animate-spin text-[#ffd15c]"
            aria-hidden="true"
          />
          <span>Unwrapping your purchased Mystery Thing…</span>
        </section>
      )}

      {/* Creator Mystery Box Collections (Automatically disappears once remainingCount === 0) */}
      {mysteryBoxes.some(
        (b) => b.remainingCount > 0 || Boolean(unboxedByCollection[b.collectionTid])
      ) && (
        <section
          aria-label={`@${playerHandle}'s Mystery Box Collections`}
          className="rpg-panel p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#9e762a]/50 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#ff4d6d]" aria-hidden="true" />
              <h2 className="font-pixel text-xs sm:text-sm text-[#ffd15c]">
                @{playerHandle.toUpperCase()}&apos;S MYSTERY BOXES
              </h2>
            </div>

            {hasFreeMysteryBoxWithTimer ? (
              <div className="inline-flex items-center gap-1.5 rounded bg-[#160f24] px-2.5 py-1 text-xs text-[#cfc3e8] border border-[#4da6ff]/50">
                <Clock className="h-3.5 w-3.5 text-[#8ec8ff]" aria-hidden="true" />
                <span>Day resets in</span>
                <span className="font-pixel text-[#fdf6e9]">
                  {formatUtcCountdown(nextPullUtcIso, nowMs)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {mysteryBoxes
              .filter(
                (box) =>
                  box.remainingCount > 0 ||
                  Boolean(unboxedByCollection[box.collectionTid])
              )
              .map((box) => {
                const unboxed = unboxedByCollection[box.collectionTid];
                const isClaiming = claimingBoxTid === box.collectionTid;
                const boxErr = boxErrors[box.collectionTid];
                const isPaidBox = box.priceCents > 0;
                const formattedPrice = formatUsdCents(box.priceCents);

                return (
                  <article
                    key={box.collectionTid}
                    className="rpg-slot p-4 sm:p-5 border-[#a87bff]/65 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-pixel text-sm sm:text-base text-[#fdf6e9]">
                            {box.name}
                          </h3>
                          {isPaidBox ? (
                            <span className="inline-flex items-center gap-1 rounded border border-[#4be3a0]/65 bg-[#251a3c] px-2.5 py-0.5 font-pixel text-[10px] text-[#4be3a0]">
                              <Coins className="h-3 w-3" aria-hidden="true" />
                              {formattedPrice} / PULL
                            </span>
                          ) : (
                            <span className="rounded border border-[#8ec8ff]/55 bg-[#251a3c] px-2.5 py-0.5 font-pixel text-[10px] text-[#8ec8ff]">
                              FREE · 1 / DAY
                            </span>
                          )}
                        </div>
                        {box.description ? (
                          <p className="text-xs sm:text-sm text-[#cfc3e8] max-w-2xl">
                            {box.description}
                          </p>
                        ) : null}
                      </div>

                      <span className="rounded border border-[#ffd15c]/60 bg-[#251a3c] px-2.5 py-1 font-pixel text-[10px] text-[#ffd15c]">
                        {box.remainingCount}{" "}
                        {box.remainingCount === 1 ? "THING" : "THINGS"} LEFT
                      </span>
                    </div>

                    {unboxed ? (
                      <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center pt-1">
                        <div className="flex flex-col items-center">
                          <div className="rpg-panel-subtle relative flex h-36 w-36 items-center justify-center p-3">
                            <img
                              src={unboxed.iconUrl}
                              alt={unboxed.iconAlt}
                              width={112}
                              height={112}
                              className="pixel-art h-28 w-28 object-contain"
                            />
                            <span className="absolute -top-2 -right-2 rounded bg-[#ff4d6d] px-2 py-0.5 font-pixel text-[9px] text-[#24040b]">
                              NEW!
                            </span>
                          </div>
                          <span className="mt-2 font-pixel text-[11px] text-[#ffd15c]">
                            CATALOG #
                            {String(unboxed.catalogNumber).padStart(4, "0")}
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-[#251a3c] px-2.5 py-0.5 text-xs text-[#8ec8ff] border border-[#4da6ff]/40">
                              {unboxed.category}
                            </span>
                            <span className="rounded bg-[#251a3c] px-2.5 py-0.5 text-xs text-[#cfc3e8]">
                              {unboxed.subcategory}
                            </span>
                          </div>

                          <h4 className="font-pixel text-sm sm:text-base text-[#fdf6e9]">
                            {unboxed.name}
                          </h4>

                          <p className="text-xs sm:text-sm leading-relaxed text-[#fdf6e9]/90">
                            {unboxed.description}
                          </p>

                          <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#251a3c]/85 px-3 py-2 text-xs border border-[#9e762a]/40">
                            <span className="italic text-[#cfc3e8]">
                              &ldquo;{unboxed.flavorText}&rdquo;
                            </span>
                            <span className="font-pixel text-[10px] text-[#ffd15c]">
                              {unboxed.uselessTrait}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setGiveTarget(unboxed)}
                              className="rpg-btn-red inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-[11px]"
                            >
                              <Send className="h-3.5 w-3.5" aria-hidden="true" />
                              Give to a Friend
                            </button>

                            <Link
                              href={`/thing/${unboxed.thingTid}`}
                              className="rpg-btn-blue inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-[11px]"
                            >
                              <ScrollText
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              View History
                            </Link>

                            {/* Paid boxes allow unlimited purchases until sold out */}
                            {!isSelf && isPaidBox && box.remainingCount > 0 ? (
                              <button
                                type="button"
                                disabled={isClaiming}
                                onClick={() =>
                                  void handleBuyPaidMysteryBox(box.collectionTid)
                                }
                                className="rpg-btn-primary inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-[11px]"
                              >
                                <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                                {isClaiming
                                  ? "Redirecting…"
                                  : `Buy Another · ${formattedPrice}`}
                              </button>
                            ) : !isSelf &&
                              !isPaidBox &&
                              viewerUnlimitedPulls &&
                              box.remainingCount > 0 ? (
                              <button
                                type="button"
                                disabled={isClaiming}
                                onClick={() =>
                                  void handleClaimMysteryBox(box.collectionTid)
                                }
                                className="rpg-btn-primary inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-[11px]"
                              >
                                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                                {isClaiming ? "Unwrapping…" : "Draw Another!"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : !isPaidBox && !isSelf && box.viewerHasClaimedToday ? (
                      <div className="flex flex-col sm:flex-row items-center gap-4 py-2 text-center sm:text-left">
                        <div className="rpg-panel-subtle flex h-24 w-24 shrink-0 items-center justify-center p-2">
                          <img
                            src="/empty-box.svg"
                            alt="16-bit open empty box"
                            width={76}
                            height={76}
                            className="pixel-art h-19 w-19"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="font-pixel text-xs text-[#fdf6e9]">
                            Today&apos;s Mystery Box Is Empty!
                          </p>
                          <p className="whitespace-pre-line text-xs sm:text-sm text-[#cfc3e8]">
                            {
                              "You've already gotten a thing from this collection today.\nCome back tomorrow for another thing!"
                            }
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
                        <div className="flex items-center gap-4">
                          <div className="rpg-panel-subtle flex h-24 w-24 shrink-0 items-center justify-center p-2">
                            <img
                              src="/icon.svg"
                              alt="16-bit wrapped mystery box"
                              width={76}
                              height={76}
                              className={`pixel-art h-19 w-19 ${
                                isClaiming
                                  ? "animate-parcel-wobble"
                                  : "animate-float-gentle"
                              }`}
                            />
                          </div>
                          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8] max-w-md">
                            {isPaidBox ? (
                              <>
                                Buy a surprise custom thing for{" "}
                                <strong className="text-[#ffd15c]">
                                  {formattedPrice}
                                </strong>{" "}
                                from <strong>@{playerHandle}</strong>&apos;s{" "}
                                <strong>{box.name}</strong> collection—no daily
                                limit while supplies last!
                              </>
                            ) : (
                              <>
                                Draw 1 surprise custom thing per day from{" "}
                                <strong>@{playerHandle}</strong>&apos;s{" "}
                                <strong>{box.name}</strong> collection before
                                the box runs out!
                              </>
                            )}
                          </p>
                        </div>

                        {isSelf ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-[#9e762a]/60 bg-[#251a3c] px-3 py-2 text-xs text-[#cfc3e8]">
                              Your Mystery Box—share your profile for others to{" "}
                              {isPaidBox ? "buy!" : "draw!"}
                            </span>
                            {viewerUnlimitedPulls ? (
                              <Link
                                href={`/make?tab=collections&editPrice=${encodeURIComponent(box.collectionTid)}`}
                                className="rpg-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 font-pixel text-[10px]"
                              >
                                <Coins
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                {isPaidBox ? "Change Price" : "Set Price"}
                              </Link>
                            ) : null}
                          </div>
                        ) : !viewerDid ? (
                          <Link
                            href={`/login?returnTo=/u/${encodeURIComponent(playerHandle)}`}
                            className="rpg-btn-blue shrink-0 inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
                          >
                            {isPaidBox
                              ? `LOGIN TO BUY · ${formattedPrice}`
                              : "LOGIN TO DRAW"}
                          </Link>
                        ) : isPaidBox ? (
                          <button
                            type="button"
                            disabled={isClaiming}
                            onClick={() =>
                              void handleBuyPaidMysteryBox(box.collectionTid)
                            }
                            className="rpg-btn-primary shrink-0 inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
                          >
                            <Coins className="h-4 w-4" aria-hidden="true" />
                            {isClaiming
                              ? "Opening Checkout…"
                              : `Buy a Mystery Thing · ${formattedPrice}`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isClaiming}
                            onClick={() =>
                              void handleClaimMysteryBox(box.collectionTid)
                            }
                            className="rpg-btn-red shrink-0 inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
                          >
                            <Gift className="h-4 w-4" aria-hidden="true" />
                            {isClaiming
                              ? "Opening Box…"
                              : "Get a Mystery Thing!"}
                          </button>
                        )}
                      </div>
                    )}

                    {boxErr ? (
                      <p role="alert" className="text-xs text-[#ff99ac]">
                        {boxErr}
                      </p>
                    ) : null}
                  </article>
                );
              })}
          </div>
        </section>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {topThings.map((item, idx) => (
                <div
                  key={item.thingTid}
                  className={`rpg-slot min-w-0 flex flex-col justify-between p-4 border-[#ffd15c]/60 ${
                    !isSelf ? "aspect-square" : ""
                  }`}
                >
                  <div className="min-w-0 flex flex-1 flex-col justify-between">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="rounded bg-[#ff4d6d] px-1.5 py-0.5 font-pixel text-[9px] text-[#24040b]">
                        #{idx + 1}
                      </span>
                      <span className="font-pixel text-[9px] text-[#8ec8ff]">
                        #{String(item.catalogNumber).padStart(4, "0")}
                      </span>
                    </div>

                    <Link
                      href={`/thing/${item.thingTid}`}
                      className="mx-auto my-2 flex min-h-0 flex-1 items-center justify-center"
                    >
                      <img
                        src={item.iconUrl}
                        alt={item.iconAlt}
                        width={144}
                        height={144}
                        className="pixel-art h-32 w-32 sm:h-36 sm:w-36 max-h-full max-w-full object-contain transition-transform hover:scale-105"
                      />
                    </Link>

                    <Link
                      href={`/thing/${item.thingTid}`}
                      className="block text-center text-xs sm:text-sm font-semibold leading-snug text-[#fdf6e9] hover:text-[#ffd15c] line-clamp-2 break-words"
                    >
                      {item.name}
                    </Link>
                  </div>

                  {isSelf && (
                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#9e762a]/40 pt-2.5 pb-1">
                      <div className="flex items-center gap-1.5">
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

                      <div className="flex items-center gap-1.5">
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
                            className="rpg-btn-red inline-flex h-6 items-center px-2 font-pixel text-[9px]"
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
          className="rpg-panel-blue p-5 sm:p-6 space-y-3"
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
