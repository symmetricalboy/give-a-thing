import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ExternalLink,
  Gift,
  Hammer,
  Palette,
  Search,
  Sparkles,
  Store,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Make Things",
  description:
    "Coming soon: create your own custom collections of pointless 16-bit things to share, gift, or sell.",
};

export default function MakeThingsPage() {
  return (
    <div className="space-y-6">
      {/* Main Coming Soon Showcase */}
      <section aria-label="Make Things Coming Soon" className="rpg-panel overflow-hidden">
        <div className="candy-ribbon w-full" aria-hidden="true" />

        <div className="p-6 sm:p-10 text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#a87bff] bg-[#160f24] px-3.5 py-1 font-pixel text-[10px] text-[#c49bff]">
            <Sparkles className="h-3.5 w-3.5 text-[#ffd15c]" aria-hidden="true" />
            <span>COMING SOON</span>
          </div>

          <div className="rpg-slot mx-auto flex h-24 w-24 items-center justify-center border-[#a87bff]/70">
            <Hammer
              className="h-11 w-11 text-[#ffd15c]"
              aria-hidden="true"
            />
          </div>

          <h1 className="font-pixel text-xl sm:text-2xl text-[#ffd15c]">
            MAKE THINGS
          </h1>

          <p className="mx-auto max-w-xl text-sm sm:text-base leading-relaxed text-[#fdf6e9]">
            The workshop is currently under construction! Soon you&apos;ll be
            able to put together your very own collections of pointless 16-bit
            things—and give them away to friends or even sell them if you wish!
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/get"
              className="rpg-btn-red inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              GET A THING
            </Link>
            <Link
              href="/search"
              className="rpg-btn-blue inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              FIND THINGS
            </Link>
          </div>
        </div>
      </section>

      {/* Upcoming Workshop Features */}
      <section aria-label="Upcoming Workshop Details" className="grid gap-4 md:grid-cols-3">
        <article className="rpg-panel-red p-5 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded bg-[#ff4d6d]/20 px-2.5 py-1 font-pixel text-[10px] text-[#ff99ac]">
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            CUSTOM SETS
          </div>
          <h2 className="font-pixel text-xs sm:text-sm text-[#fdf6e9]">
            Create Your Own Collections
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8]">
            Craft themed sets and mini-series of original things—complete with
            custom 16-bit sprites, descriptions, flavor quotes, and delightfully
            useless traits curated by you.
          </p>
        </article>

        <article className="rpg-panel-blue p-5 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded bg-[#4da6ff]/20 px-2.5 py-1 font-pixel text-[10px] text-[#8ec8ff]">
            <Store className="h-3.5 w-3.5" aria-hidden="true" />
            SHARE OR SELL
          </div>
          <h2 className="font-pixel text-xs sm:text-sm text-[#fdf6e9]">
            Sell Them If You Wish
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8]">
            Make a collection just to hand out for free to friends, or open up
            your own little shop stall to sell editions or mystery boxes of your
            collections if you wish!
          </p>
        </article>

        <article className="rpg-panel p-5 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded bg-[#ffd15c]/20 px-2.5 py-1 font-pixel text-[10px] text-[#ffd15c]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            FULL HISTORY
          </div>
          <h2 className="font-pixel text-xs sm:text-sm text-[#fdf6e9]">
            Tradeable &amp; Pin-Ready
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8]">
            Every player-made thing will carry its creator&apos;s mark and full
            gift history wherever it travels, ready to be traded and pinned in
            anyone&apos;s Top 8 showcase.
          </p>
        </article>
      </section>

      {/* Follow Along Banner */}
      <section className="rpg-panel-subtle p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="space-y-1">
          <p className="font-pixel text-xs text-[#ffd15c]">
            HAVE IDEAS FOR MAKING THINGS?
          </p>
          <p className="text-xs sm:text-sm text-[#cfc3e8]">
            Follow along on Bluesky for launch news—or send us what kinds of
            collections you&apos;d love to make!
          </p>
        </div>

        <a
          href="https://bsky.app/profile/giveathing.com"
          target="_blank"
          rel="noopener noreferrer"
          className="rpg-btn-secondary shrink-0 inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs text-[#8ec8ff]"
        >
          @giveathing.com
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
