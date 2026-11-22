"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Gift, ScrollText, Send, Sparkles } from "lucide-react";
import { GiveThingModal } from "./GiveThingModal";

export interface TodaysThingView {
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
  transferCount?: number;
}

interface DailyParcelPedestalProps {
  authenticated: boolean;
  initialHasPulled: boolean;
  initialUnlimitedPulls: boolean;
  initialNextPullUtcIso: string;
  initialTodaysThing: TodaysThingView | null;
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

export function DailyParcelPedestal({
  authenticated,
  initialHasPulled,
  initialUnlimitedPulls,
  initialNextPullUtcIso,
  initialTodaysThing,
}: DailyParcelPedestalProps) {
  const router = useRouter();
  const [hasPulled, setHasPulled] = useState(initialHasPulled);
  const [unlimitedPulls, setUnlimitedPulls] = useState(initialUnlimitedPulls);
  const [todaysThing, setTodaysThing] = useState<TodaysThingView | null>(
    initialTodaysThing
  );
  const [nextPullIso, setNextPullIso] = useState(initialNextPullUtcIso);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [pulling, setPulling] = useState(false);
  const [justUnboxed, setJustUnboxed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giveModalOpen, setGiveModalOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (hasPulled && current >= new Date(nextPullIso).getTime()) {
        setHasPulled(false);
        setTodaysThing(null);
        const tomorrow = new Date(
          Date.UTC(
            new Date(current).getUTCFullYear(),
            new Date(current).getUTCMonth(),
            new Date(current).getUTCDate() + 1
          )
        );
        setNextPullIso(tomorrow.toISOString());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [hasPulled, nextPullIso]);

  async function handleOpenParcel() {
    setError(null);
    setPulling(true);
    try {
      const res = await fetch("/api/pull", { method: "POST" });
      const data = (await res.json()) as {
        thing?: TodaysThingView & {
          nextPullUtcIso: string;
          unlimitedPulls?: boolean;
        };
        error?: string;
      };
      if (!res.ok || !data.thing) {
        setError(data.error ?? "Failed to open mystery parcel.");
        setPulling(false);
        return;
      }

      const isUnlim = Boolean(data.thing.unlimitedPulls || unlimitedPulls);
      setUnlimitedPulls(isUnlim);
      setTodaysThing(data.thing);
      setHasPulled(!isUnlim);
      setNextPullIso(data.thing.nextPullUtcIso);
      setJustUnboxed(true);
      router.refresh();
    } catch {
      setError("Network error reaching Give a Thing.");
    } finally {
      setPulling(false);
    }
  }

  const countdownText = formatUtcCountdown(nextPullIso, nowMs);

  return (
    <section aria-label="Daily Mystery Pull" className="rpg-panel p-5 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#8c6826]/50 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#f5c451]" aria-hidden="true" />
          <h1 className="font-pixel text-xs sm:text-sm text-[#f5c451]">
            GET TODAY&apos;S THING
          </h1>
          {unlimitedPulls && (
            <span className="rounded bg-[#4be3a0]/20 px-2 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
              UNLIMITED MODE (@giveathing.com)
            </span>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded bg-[#140f1d] px-2.5 py-1 text-xs text-[#bfb2d6] border border-[#8c6826]/50">
          <Clock className="h-3.5 w-3.5 text-[#e5b54f]" aria-hidden="true" />
          <span>UTC Reset in</span>
          <span className="font-pixel text-[#fbf4e4]">{countdownText}</span>
        </div>
      </div>

      {!todaysThing ? (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="rpg-slot mb-5 flex h-32 w-32 items-center justify-center p-3">
            <img
              src="/icon.svg"
              alt="16-bit wrapped mystery parcel"
              width={104}
              height={104}
              className={`pixel-art h-26 w-26 ${
                pulling ? "animate-parcel-wobble" : "animate-float-gentle"
              }`}
            />
          </div>

          <h2 className="font-pixel text-base sm:text-lg text-[#fbf4e4] mb-2">
            {pulling
              ? "Conjuring a One-of-a-Kind Thing..."
              : "Today's Pointless Thing Awaits!"}
          </h2>
          <p className="max-w-lg text-sm text-[#bfb2d6] mb-5">
            {pulling
              ? "Gemini 4 Carbon is checking the entire historical catalog to guarantee zero duplicates and painting your 16-bit sprite..."
              : "Every UTC day, click once to get a completely unique, utterly useless thing—recorded permanently on ATProtocol so you can keep it or give it to a friend."}
          </p>

          {error && (
            <p
              role="alert"
              className="mb-4 max-w-md border border-[#ff5c8a] bg-[#ff5c8a]/15 px-3.5 py-2 text-xs text-[#ff9bb6]"
            >
              {error}
            </p>
          )}

          {authenticated ? (
            <button
              type="button"
              disabled={pulling}
              onClick={handleOpenParcel}
              className="rpg-btn-primary inline-flex items-center gap-2.5 px-6 py-3.5 font-pixel text-xs sm:text-sm"
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              {pulling ? "Opening Parcel..." : "Get a Thing!"}
            </button>
          ) : (
            <p className="rounded border border-[#e5b54f]/50 bg-[#140f1d] px-4 py-2.5 text-xs text-[#fbf4e4]">
              Click <strong>Sign in with Bluesky</strong> in the top bar to get
              today&apos;s thing!
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
          {/* 16-Bit Inventory Pedestal */}
          <div className="flex flex-col items-center">
            <div className="rpg-slot relative flex h-36 w-36 items-center justify-center p-3">
              <img
                src={todaysThing.iconUrl}
                alt={todaysThing.iconAlt}
                width={112}
                height={112}
                className="pixel-art h-28 w-28 object-contain"
              />
              {justUnboxed && (
                <span className="absolute -top-2.5 -right-2.5 rounded bg-[#ff5c8a] px-2 py-0.5 font-pixel text-[9px] text-white shadow">
                  NEW!
                </span>
              )}
            </div>
            <span className="mt-2 font-pixel text-xs text-[#e5b54f]">
              CATALOG #{String(todaysThing.catalogNumber).padStart(4, "0")}
            </span>
          </div>

          {/* Thing Details & Actions */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#140f1d] px-2.5 py-0.5 text-xs font-medium text-[#4be3a0] border border-[#4be3a0]/30">
                {todaysThing.category}
              </span>
              <span className="rounded bg-[#140f1d] px-2.5 py-0.5 text-xs text-[#bfb2d6]">
                {todaysThing.subcategory}
              </span>
            </div>

            <h2 className="font-pixel text-base sm:text-lg text-[#fbf4e4]">
              {todaysThing.name}
            </h2>

            <p className="text-sm leading-relaxed text-[#fbf4e4]/90">
              {todaysThing.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#140f1d]/80 px-3 py-2 text-xs border border-[#8c6826]/40">
              <span className="italic text-[#bfb2d6]">
                &ldquo;{todaysThing.flavorText}&rdquo;
              </span>
              <span className="font-pixel text-[10px] text-[#f5c451]">
                {todaysThing.uselessTrait}
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="border border-[#ff5c8a] bg-[#ff5c8a]/15 px-3.5 py-2 text-xs text-[#ff9bb6]"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setGiveModalOpen(true)}
                className="rpg-btn-primary inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Give to a Friend
              </button>

              <Link
                href={`/thing/${todaysThing.thingTid}`}
                className="rpg-btn-secondary inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
              >
                <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                Inspect Ledger
              </Link>

              {unlimitedPulls && (
                <button
                  type="button"
                  disabled={pulling}
                  onClick={handleOpenParcel}
                  className="rpg-btn-secondary inline-flex items-center gap-2 border-[#4be3a0] px-4 py-2.5 font-pixel text-xs text-[#4be3a0]"
                >
                  <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                  {pulling ? "Generating..." : "Get Another Thing!"}
                </button>
              )}
            </div>
          </div>

          <GiveThingModal
            open={giveModalOpen}
            onClose={() => setGiveModalOpen(false)}
            thing={todaysThing}
          />
        </div>
      )}
    </section>
  );
}
