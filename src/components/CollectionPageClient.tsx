"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock,
  Coins,
  Gift,
  Hammer,
  Loader2,
  PackageOpen,
  ScrollText,
  Send,
  Sparkles,
} from "lucide-react";
import type {
  ProfileMysteryBoxCollection,
  PublicUserBrief,
  ThingCardItem,
} from "@/lib/queries";
import { formatUsdCents } from "@/lib/stripe/pricing";
import { GiveThingModal, type GiveableThingSummary } from "./GiveThingModal";
import { ThingGridCard } from "./ThingGridCard";

interface UnboxedCollectionThing {
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
  remainingCount: number;
  unlimitedPulls?: boolean;
}

interface CollectionPageClientProps {
  initialCollection: ProfileMysteryBoxCollection & {
    revealedCount: number;
  };
  creator: PublicUserBrief;
  initialRevealedItems: ThingCardItem[];
  viewerDid: string | null;
  viewerUnlimitedPulls: boolean;
  nextPullUtcIso: string;
}

function formatUtcCountdown(targetIso: string, nowMs: number): string {
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function CollectionPageClient({
  initialCollection,
  creator,
  initialRevealedItems,
  viewerDid,
  viewerUnlimitedPulls,
  nextPullUtcIso,
}: CollectionPageClientProps) {
  const router = useRouter();
  const uid = useId();
  const unboxedHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const isCreator = Boolean(viewerDid && viewerDid === creator.did);
  const [box, setBox] = useState(initialCollection);
  const [revealedItems, setRevealedItems] =
    useState<ThingCardItem[]>(initialRevealedItems);
  const [unboxed, setUnboxed] = useState<UnboxedCollectionThing | null>(null);
  const [shouldFocusUnboxed, setShouldFocusUnboxed] = useState(false);

  const [claiming, setClaiming] = useState(false);
  const [fulfillingCheckout, setFulfillingCheckout] = useState(false);
  const [boxError, setBoxError] = useState<string | null>(null);
  const [favBusyTid, setFavBusyTid] = useState<string | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const [giveTarget, setGiveTarget] = useState<GiveableThingSummary | null>(
    null
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setBox((prev) => ({
      ...initialCollection,
      // Keep remainingCount accurate while preserving unboxed reveal state
      remainingCount: initialCollection.remainingCount,
      viewerHasClaimedToday:
        initialCollection.viewerHasClaimedToday || prev.viewerHasClaimedToday,
    }));
    setRevealedItems(initialRevealedItems);
  }, [initialCollection, initialRevealedItems]);

  useEffect(() => {
    if (!shouldFocusUnboxed) return;
    if (unboxedHeadingRef.current) {
      unboxedHeadingRef.current.focus();
      setShouldFocusUnboxed(false);
    }
  }, [shouldFocusUnboxed, unboxed]);

  const isPaidBox = box.priceCents > 0;
  const formattedPrice = formatUsdCents(box.priceCents);
  const showFreeResetTimer =
    !isPaidBox && !viewerUnlimitedPulls && !isCreator && box.remainingCount > 0;

  useEffect(() => {
    if (!showFreeResetTimer) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showFreeResetTimer]);

  // Handle Stripe Checkout return (`?checkout_session_id=...`) or cancel (`?checkout_cancelled=...`)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("checkout_session_id");
    const cancelledPurchaseId = url.searchParams.get("checkout_cancelled");

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
      setBoxError(null);
      void fetch("/api/collections/checkout/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: sessionId }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            ok?: boolean;
            error?: string;
            thing?: UnboxedCollectionThing;
          };
          if (!res.ok || !data.thing) {
            setBoxError(
              data.error ?? "Could not unwrap your purchased mystery thing."
            );
            return;
          }

          setUnboxed(data.thing);
          setBox((prev) => ({
            ...prev,
            remainingCount: data.thing!.remainingCount,
            viewerHasClaimedToday: false,
          }));
          setShouldFocusUnboxed(true);
          router.refresh();
        })
        .catch(() => {
          setBoxError(
            "Network error verifying your purchase—check YOUR THINGS in a moment!"
          );
        })
        .finally(() => {
          setFulfillingCheckout(false);
        });
    }
  }, [router]);

  async function handleBuyPaidMysteryBox() {
    setClaiming(true);
    setBoxError(null);

    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(box.collectionTid)}/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnContext: "collection" }),
        }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        checkoutUrl?: string;
        soldOut?: boolean;
        error?: string;
      };

      if (!res.ok || !data.checkoutUrl) {
        if (data.soldOut) {
          setBox((prev) => ({ ...prev, remainingCount: 0 }));
        }
        setBoxError(
          data.error ?? "Could not start checkout for this mystery box."
        );
        setClaiming(false);
        return;
      }

      window.location.assign(data.checkoutUrl);
    } catch {
      setBoxError("Network error reaching Give a Thing.");
      setClaiming(false);
    }
  }

  async function handleClaimFreeMysteryBox() {
    setClaiming(true);
    setBoxError(null);

    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(box.collectionTid)}/claim`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        soldOut?: boolean;
        thing?: UnboxedCollectionThing;
      };

      if (!res.ok || !data.thing) {
        if (data.soldOut) {
          setBox((prev) => ({ ...prev, remainingCount: 0 }));
        }
        setBoxError(data.error ?? "Could not draw from this mystery box.");
        return;
      }

      const drawn = data.thing;
      const isUnlim = Boolean(drawn.unlimitedPulls || viewerUnlimitedPulls);

      setUnboxed(drawn);
      setBox((prev) => ({
        ...prev,
        remainingCount: drawn.remainingCount,
        viewerHasClaimedToday: !isUnlim,
      }));
      setShouldFocusUnboxed(true);
      router.refresh();
    } catch {
      setBoxError("Network error reaching Give a Thing.");
    } finally {
      setClaiming(false);
    }
  }

  async function handleToggleFavorite(item: ThingCardItem) {
    setFavBusyTid(item.thingTid);
    setFavError(null);
    try {
      const action = item.favoriteSlot ? "remove" : "add";
      const res = await fetch("/api/profile/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thingTid: item.thingTid, action }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        slot?: number | null;
        error?: string;
      };
      if (!res.ok) {
        setFavError(data.error ?? "Could not update Top 8 favorites.");
        return;
      }

      setRevealedItems((prev) =>
        prev.map((t) =>
          t.thingTid === item.thingTid
            ? { ...t, favoriteSlot: action === "remove" ? null : (data.slot ?? 1) }
            : t
        )
      );
      router.refresh();
    } catch {
      setFavError("Network error updating Top 8 favorites.");
    } finally {
      setFavBusyTid(null);
    }
  }

  const showMysteryBoxPedestal = box.remainingCount > 0 || Boolean(unboxed);

  return (
    <div className="space-y-6">
      {/* Collection Hero Banner */}
      <section
        aria-labelledby={`${uid}-collection-title`}
        className="rpg-panel overflow-hidden"
      >
        <div className="candy-ribbon w-full" aria-hidden="true" />

        <div className="p-5 sm:p-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded bg-[#483275] px-2.5 py-1 font-pixel text-[10px] text-[#ffd15c] border border-[#ffd15c]/50">
                <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
                MYSTERY BOX COLLECTION
              </span>

              {box.remainingCount > 0 ? (
                <span className="rounded border border-[#4be3a0]/65 bg-[#160f24] px-2.5 py-1 font-pixel text-[10px] text-[#4be3a0]">
                  OPEN · {box.remainingCount}{" "}
                  {box.remainingCount === 1 ? "THING" : "THINGS"} LEFT
                </span>
              ) : (
                <span className="rounded border border-[#ff4d6d]/65 bg-[#160f24] px-2.5 py-1 font-pixel text-[10px] text-[#ff99ac]">
                  SOLD OUT
                </span>
              )}

              {isPaidBox ? (
                <span className="inline-flex items-center gap-1 rounded border border-[#ffd15c]/65 bg-[#160f24] px-2.5 py-1 font-pixel text-[10px] text-[#ffd15c]">
                  <Coins className="h-3 w-3" aria-hidden="true" />
                  {formattedPrice} / PULL
                </span>
              ) : (
                <span className="rounded border border-[#8ec8ff]/55 bg-[#160f24] px-2.5 py-1 font-pixel text-[10px] text-[#8ec8ff]">
                  FREE · 1 / DAY
                </span>
              )}
            </div>

            {isCreator ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/make?tab=collections&editPrice=${encodeURIComponent(box.collectionTid)}`}
                  className="rpg-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px] text-[#ffd15c]"
                >
                  <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                  {isPaidBox ? "Change Price" : "Set Price"}
                </Link>
                <Link
                  href="/make?tab=collections"
                  className="rpg-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px] text-[#8ec8ff]"
                >
                  <Hammer className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit / Add Things
                </Link>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <h1
              id={`${uid}-collection-title`}
              className="font-pixel text-lg sm:text-2xl text-[#fdf6e9]"
            >
              {box.name}
            </h1>
            {box.description ? (
              <p className="text-sm sm:text-base leading-relaxed text-[#cfc3e8] max-w-3xl">
                {box.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9e762a]/40 pt-4 text-xs">
            <div className="flex items-center gap-2.5">
              {creator.avatarUrl ? (
                <img
                  src={creator.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-[#ffd15c]/60 object-cover"
                />
              ) : null}
              <span className="text-[#cfc3e8]">
                Created by{" "}
                <Link
                  href={`/u/${encodeURIComponent(creator.handle)}`}
                  className="font-semibold text-[#ffd15c] hover:underline"
                >
                  @{creator.handle}
                </Link>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-pixel text-[10px]">
              <span className="rounded bg-[#160f24] px-2.5 py-1 text-[#8ec8ff] border border-[#4da6ff]/40">
                {revealedItems.length} / {box.totalItems} REVEALED
              </span>
              <span className="rounded bg-[#160f24] px-2.5 py-1 text-[#ffd15c] border border-[#ffd15c]/40">
                {box.remainingCount} UNCLAIMED
              </span>
            </div>
          </div>
        </div>
      </section>

      {fulfillingCheckout ? (
        <div className="rpg-panel-blue p-5 flex items-center justify-center gap-3 text-sm text-[#fdf6e9]">
          <Loader2
            className="h-4 w-4 animate-spin text-[#ffd15c]"
            aria-hidden="true"
          />
          <span>Unwrapping your purchased Mystery Thing…</span>
        </div>
      ) : null}

      {/* Open Mystery Box Pedestal (Shown while items remain OR right after unwrapping the final item) */}
      {showMysteryBoxPedestal ? (
        <section
          aria-labelledby={`${uid}-pedestal-heading`}
          className="rpg-panel p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#9e762a]/50 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#ff4d6d]" aria-hidden="true" />
              <h2
                id={`${uid}-pedestal-heading`}
                className="font-pixel text-xs sm:text-sm text-[#ffd15c]"
              >
                {unboxed
                  ? "NEWLY UNWRAPPED FROM THIS MYSTERY BOX!"
                  : isPaidBox
                    ? "PURCHASE A MYSTERY THING"
                    : "UNWRAP A MYSTERY THING"}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showFreeResetTimer ? (
                <div className="inline-flex items-center gap-1.5 rounded bg-[#160f24] px-2.5 py-1 text-xs text-[#cfc3e8] border border-[#4da6ff]/50">
                  <Clock
                    className="h-3.5 w-3.5 text-[#8ec8ff]"
                    aria-hidden="true"
                  />
                  <span>Day resets in</span>
                  <span className="font-pixel text-[#fdf6e9]">
                    {formatUtcCountdown(nextPullUtcIso, nowMs)}
                  </span>
                </div>
              ) : null}

              <span className="rounded border border-[#ffd15c]/60 bg-[#251a3c] px-2.5 py-1 font-pixel text-[10px] text-[#ffd15c]">
                {box.remainingCount === 0 && unboxed
                  ? "FINAL THING · SOLD OUT!"
                  : `${box.remainingCount} ${
                      box.remainingCount === 1 ? "THING" : "THINGS"
                    } LEFT`}
              </span>
            </div>
          </div>

          <article className="rpg-slot p-4 sm:p-5 border-[#a87bff]/65 space-y-4">
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
                    CATALOG #{String(unboxed.catalogNumber).padStart(4, "0")}
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

                  <h3
                    ref={unboxedHeadingRef}
                    tabIndex={-1}
                    className="font-pixel text-sm sm:text-base text-[#fdf6e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd15c]"
                  >
                    {unboxed.name}
                  </h3>

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
                      <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                      View History
                    </Link>

                    {!isCreator && isPaidBox && box.remainingCount > 0 ? (
                      <button
                        type="button"
                        disabled={claiming}
                        onClick={() => void handleBuyPaidMysteryBox()}
                        className="rpg-btn-primary inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-[11px]"
                      >
                        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                        {claiming
                          ? "Redirecting…"
                          : `Buy Another · ${formattedPrice}`}
                      </button>
                    ) : !isCreator &&
                      !isPaidBox &&
                      viewerUnlimitedPulls &&
                      box.remainingCount > 0 ? (
                      <button
                        type="button"
                        disabled={claiming}
                        onClick={() => void handleClaimFreeMysteryBox()}
                        className="rpg-btn-primary inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-[11px]"
                      >
                        <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                        {claiming ? "Unwrapping…" : "Draw Another!"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : !isPaidBox && !isCreator && box.viewerHasClaimedToday ? (
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
                        claiming
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
                        from <strong>@{creator.handle}</strong>&apos;s Mystery
                        Box—no daily limit, purchase as many pulls as you want
                        while supplies last!
                      </>
                    ) : (
                      <>
                        Draw 1 surprise custom thing per day from{" "}
                        <strong>@{creator.handle}</strong>&apos;s Mystery Box—
                        yours to keep or give away!
                      </>
                    )}
                  </p>
                </div>

                {!viewerDid ? (
                  <Link
                    href={`/login?returnTo=/collection/${encodeURIComponent(box.collectionTid)}`}
                    className="rpg-btn-blue shrink-0 inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
                  >
                    {isPaidBox ? (
                      <>
                        <Coins className="h-4 w-4" aria-hidden="true" />
                        Log in to Buy · {formattedPrice}
                      </>
                    ) : (
                      <>
                        <Gift className="h-4 w-4" aria-hidden="true" />
                        Log in to Unwrap
                      </>
                    )}
                  </Link>
                ) : isCreator ? (
                  <div className="flex flex-col sm:items-end gap-2">
                    <span className="text-xs text-[#cfc3e8]">
                      Creators can&apos;t pull from their own Mystery Boxes—share
                      this page so friends can unwrap one!
                    </span>
                  </div>
                ) : isPaidBox ? (
                  <button
                    type="button"
                    disabled={claiming}
                    onClick={() => void handleBuyPaidMysteryBox()}
                    className="rpg-btn-primary shrink-0 inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
                  >
                    {claiming ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Opening Checkout…
                      </>
                    ) : (
                      <>
                        <Coins className="h-4 w-4" aria-hidden="true" />
                        Buy a Mystery Thing · {formattedPrice}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={claiming}
                    onClick={() => void handleClaimFreeMysteryBox()}
                    className="rpg-btn-primary shrink-0 inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
                  >
                    {claiming ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Unwrapping…
                      </>
                    ) : (
                      <>
                        <Gift className="h-4 w-4" aria-hidden="true" />
                        Unwrap a Mystery Thing
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {boxError ? (
              <p
                role="alert"
                className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3 py-2 text-xs text-[#ff99ac]"
              >
                {boxError}
              </p>
            ) : null}
          </article>
        </section>
      ) : null}

      {/* Revealed Things Showcase */}
      <section
        aria-labelledby={`${uid}-revealed-heading`}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id={`${uid}-revealed-heading`}
            className="font-pixel text-xs sm:text-sm text-[#ffd15c]"
          >
            REVEALED THINGS ({revealedItems.length} OF {box.totalItems})
          </h2>
          {box.remainingCount > 0 ? (
            <span className="text-xs text-[#cfc3e8]">
              {box.remainingCount}{" "}
              {box.remainingCount === 1 ? "mystery thing" : "mystery things"}{" "}
              still hidden inside the box
            </span>
          ) : (
            <span className="text-xs text-[#4be3a0]">
              Every thing in this collection has been revealed!
            </span>
          )}
        </div>

        {favError ? (
          <p
            role="alert"
            className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3.5 py-2 text-xs text-[#ff99ac]"
          >
            {favError}
          </p>
        ) : null}

        {revealedItems.length === 0 ? (
          <div className="rpg-panel-subtle p-8 text-center space-y-2">
            <p className="font-pixel text-xs text-[#ffd15c]">
              NO THINGS REVEALED YET!
            </p>
            <p className="text-sm text-[#cfc3e8] max-w-md mx-auto">
              All {box.remainingCount} custom things in{" "}
              <strong>{box.name}</strong> are still sealed inside the Mystery
              Box—unwrap one above to be the very first discoverer!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {revealedItems.map((item) => {
              const viewerOwnsCard = Boolean(
                viewerDid && item.currentOwner.did === viewerDid
              );
              return (
                <ThingGridCard
                  key={item.thingTid}
                  item={item}
                  isViewerOwner={viewerOwnsCard}
                  favoriteBusy={favBusyTid === item.thingTid}
                  onToggleFavorite={
                    viewerOwnsCard
                      ? (selected) => void handleToggleFavorite(selected)
                      : undefined
                  }
                  onGiveClick={
                    viewerOwnsCard
                      ? (selected) => setGiveTarget(selected)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <GiveThingModal
        open={Boolean(giveTarget)}
        thing={giveTarget}
        onClose={() => setGiveTarget(null)}
        onSuccess={() => {
          setGiveTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}
