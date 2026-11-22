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
  Send,
  Star,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { ThingCardItem } from "@/lib/queries";
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
  topThings: Array<ThingCardItem & { favoriteSlot: number }>;
  inventory: ThingCardItem[];
  outgoingEscrows: OutgoingEscrowItem[];
}

export function UserProfileClient({
  playerDid,
  playerHandle,
  viewerDid,
  initialIsFollowing,
  topThings,
  inventory,
  outgoingEscrows,
}: UserProfileClientProps) {
  const router = useRouter();
  const isSelf = viewerDid === playerDid;

  const [following, setFollowing] = useState(initialIsFollowing);
  const [followBusy, setFollowBusy] = useState(false);
  const [giveTarget, setGiveTarget] = useState<ThingCardItem | null>(null);
  const [favBusyTid, setFavBusyTid] = useState<string | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedOffer, setCopiedOffer] = useState<string | null>(null);
  const [revokingTid, setRevokingTid] = useState<string | null>(null);

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

  return (
    <div className="space-y-8">
      {viewerDid && !isSelf && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={followBusy}
            onClick={toggleFollow}
            className={`inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs ${
              following ? "rpg-btn-secondary text-[#4be3a0]" : "rpg-btn-primary"
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
        </div>
      )}

      {favError && (
        <p
          role="alert"
          className="border border-[#ff5c8a] bg-[#ff5c8a]/15 px-4 py-2.5 text-xs text-[#ff9bb6]"
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#8c6826]/50 pb-3">
            <div className="flex items-center gap-2">
              <Star
                className="h-4 w-4 fill-[#f5c451] text-[#f5c451]"
                aria-hidden="true"
              />
              <h2 className="font-pixel text-xs sm:text-sm text-[#f5c451]">
                @{playerHandle.toUpperCase()}&apos;S TOP 8 THINGS (
                {topThings.length}/8)
              </h2>
            </div>
            {isSelf && (
              <span className="text-xs text-[#bfb2d6]">
                Click &ldquo;Top 8&rdquo; on any thing you own below to feature
                up to 8 favorites here
              </span>
            )}
          </div>

          {topThings.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#bfb2d6]">
              You haven&apos;t picked your Top 8 things yet! Click{" "}
              <strong>Top 8</strong> on any of your things below to pin them to
              the top of your profile.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {topThings.map((item, idx) => (
                <div
                  key={item.thingTid}
                  className="rpg-slot flex flex-col justify-between p-3 border-[#e5b54f]/60"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="rounded bg-[#f5c451] px-1.5 py-0.5 font-pixel text-[9px] text-[#1a1105]">
                        #{idx + 1}
                      </span>
                      <span className="font-pixel text-[9px] text-[#bfb2d6]">
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
                      className="block text-center text-xs font-semibold leading-snug text-[#fbf4e4] hover:text-[#f5c451] line-clamp-2"
                    >
                      {item.name}
                    </Link>
                  </div>

                  {isSelf && (
                    <div className="mt-3 flex items-center justify-between gap-1 border-t border-[#8c6826]/40 pt-2">
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
                          className="rpg-btn-secondary inline-flex h-6 w-6 items-center justify-center text-[#f5c451]"
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
                            className="rpg-btn-primary inline-flex h-6 items-center px-1.5 font-pixel text-[9px]"
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
          className="rpg-panel border-[#5cc8ff] p-5 space-y-3"
        >
          <h2 className="font-pixel text-xs sm:text-sm text-[#5cc8ff]">
            THINGS SET ASIDE FOR FRIENDS ({outgoingEscrows.length})
          </h2>
          <p className="text-xs text-[#bfb2d6]">
            These things are locked in escrow awaiting Bluesky sign-in. Once an
            offer goes unclaimed for over 24 hours, you can revoke it back into
            your active collection.
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded bg-[#140f1d] p-3 border border-[#5cc8ff]/35"
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
                      <p className="truncate text-sm font-semibold text-[#fbf4e4]">
                        #{String(offer.catalogNumber).padStart(4, "0")}{" "}
                        {offer.thingName}
                      </p>
                      <p className="text-xs text-[#5cc8ff]">
                        Reserved for @{offer.recipientHandle}{" "}
                        {!unlocked && (
                          <span className="text-[#bfb2d6]">
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
                      className="rpg-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px]"
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
                      className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] text-[#ff9bb6]"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {revokingTid === offer.offerTid
                        ? "Revoking..."
                        : unlocked
                          ? "Revoke Offer"
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
          <h2 className="font-pixel text-xs sm:text-sm text-[#f5c451]">
            ALL THINGS OWNED ({inventory.length})
          </h2>
          {isSelf && inventory.length > 0 && (
            <span className="text-xs text-[#bfb2d6]">
              Give any thing to a friend anytime!
            </span>
          )}
        </div>

        {inventory.length === 0 ? (
          <div className="rpg-panel-subtle p-10 text-center">
            <p className="font-pixel text-xs text-[#f5c451] mb-2">
              No Things Owned Right Now!
            </p>
            <p className="text-sm text-[#bfb2d6]">
              {isSelf
                ? "Head to the Daily Pull pedestal to get today's pointless thing!"
                : `@${playerHandle} has given away all their things (or hasn't pulled today yet).`}
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

      <GiveThingModal
        open={Boolean(giveTarget)}
        onClose={() => setGiveTarget(null)}
        thing={giveTarget}
      />
    </div>
  );
}
