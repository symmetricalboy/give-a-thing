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
    <section aria-label="Get a Thing" className="rpg-panel p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#9e762a]/50 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#ff4d6d]" aria-hidden="true" />
          <h1 className="font-pixel text-xs sm:text-sm text-[#ffd15c]">
            GET A THING
          </h1>
          {unlimitedPulls && (
            <span className="rounded bg-[#4be3a0]/20 px-2 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
              UNLIMITED MODE (@giveathing.com)
            </span>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded bg-[#160f24] px-2.5 py-1 text-xs text-[#cfc3e8] border border-[#4da6ff]/50">
          <Clock className="h-3.5 w-3.5 text-[#8ec8ff]" aria-hidden="true" />
          <span>UTC Reset in</span>
          <span className="font-pixel text-[#fdf6e9]">{countdownText}</span>
        </div>
      </div>

      {!todaysThing ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="rpg-slot mb-5 flex h-36 w-36 items-center justify-center p-3 border-[#ff4d6d]/60">
            <img
              src="/icon.svg"
              alt="16-bit wrapped mystery parcel"
              width={108}
              height={108}
              className={`pixel-art h-27 w-27 ${
                pulling ? "animate-parcel-wobble" : "animate-float-gentle"
              }`}
            />
          </div>

          <h2 className="font-pixel text-base sm:text-lg text-[#fdf6e9] mb-2">
            {pulling
              ? "Selecting a Thing Just for You..."
              : "Today's Pointless Thing Awaits!"}
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-[#cfc3e8] mb-6">
            {pulling
              ? "A thing is being selected for you right now, and it could take up to about 1 minute to find the right thing. Hang tight!"
              : "Every UTC day, click once to unwrap a completely unique, utterly pointless 16-bit thing you can keep in your collection or give away to any friend!"}
          </p>

          {error && (
            <p
              role="alert"
              className="mb-4 max-w-md rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3.5 py-2 text-xs text-[#ff99ac]"
            >
              {error}
            </p>
          )}

          {authenticated ? (
            <button
              type="button"
              disabled={pulling}
              onClick={handleOpenParcel}
              className="rpg-btn-red inline-flex items-center gap-2.5 px-7 py-3.5 font-pixel text-xs sm:text-sm"
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              {pulling ? "Finding the Right Thing..." : "Get a Thing!"}
            </button>
          ) : (
            <p className="rounded border-2 border-[#4da6ff]/60 bg-[#160f24] px-4 py-3 text-xs text-[#fdf6e9]">
              Click <strong>Sign in with Bluesky</strong> in the top bar to get
              today&apos;s thing!
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          {/* 16-Bit Inventory Pedestal */}
          <div className="flex flex-col items-center">
            <div className="rpg-slot relative flex h-40 w-40 items-center justify-center p-3 border-[#4da6ff]/60">
              <img
                src={todaysThing.iconUrl}
                alt={todaysThing.iconAlt}
                width={120}
                height={120}
                className="pixel-art h-30 w-30 object-contain"
              />
              {justUnboxed && (
                <span className="absolute -top-2.5 -right-2.5 rounded bg-[#ff4d6d] px-2 py-0.5 font-pixel text-[9px] text-[#24040b] shadow">
                  NEW!
                </span>
              )}
            </div>
            <span className="mt-2 font-pixel text-xs text-[#ffd15c]">
              CATALOG #{String(todaysThing.catalogNumber).padStart(4, "0")}
            </span>
          </div>

          {/* Thing Details & Actions */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#160f24] px-2.5 py-0.5 text-xs font-medium text-[#8ec8ff] border border-[#4da6ff]/45">
                {todaysThing.category}
              </span>
              <span className="rounded bg-[#160f24] px-2.5 py-0.5 text-xs text-[#cfc3e8]">
                {todaysThing.subcategory}
              </span>
            </div>

            <h2 className="font-pixel text-base sm:text-lg text-[#fdf6e9]">
              {todaysThing.name}
            </h2>

            <p className="text-sm leading-relaxed text-[#fdf6e9]/90">
              {todaysThing.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#160f24]/85 px-3 py-2 text-xs border border-[#9e762a]/40">
              <span className="italic text-[#cfc3e8]">
                &ldquo;{todaysThing.flavorText}&rdquo;
              </span>
              <span className="font-pixel text-[10px] text-[#ffd15c]">
                {todaysThing.uselessTrait}
              </span>
            </div>

            {pulling && (
              <p className="rounded border border-[#4da6ff]/50 bg-[#4da6ff]/10 px-3.5 py-2 text-xs text-[#8ec8ff]">
                Selecting another thing for you—it could take up to about 1
                minute to find the right thing...
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3.5 py-2 text-xs text-[#ff99ac]"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setGiveModalOpen(true)}
                className="rpg-btn-red inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Give to a Friend
              </button>

              <Link
                href={`/thing/${todaysThing.thingTid}`}
                className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
              >
                <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
                View History
              </Link>

              {unlimitedPulls && (
                <button
                  type="button"
                  disabled={pulling}
                  onClick={handleOpenParcel}
                  className="rpg-btn-primary inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
                >
                  <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                  {pulling ? "Finding Next Thing..." : "Get Another Thing!"}
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
