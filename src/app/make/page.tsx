import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Coins,
  Gift,
  Hammer,
  Palette,
  Search,
  Sparkles,
} from "lucide-react";
import { MakerStudioClient } from "@/components/MakerStudioClient";
import {
  listCreatorCollectionsForStudio,
  type CreatorStudioCollectionSummary,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";
import {
  syncCreatorPayoutStatus,
  type CreatorPayoutStatus,
} from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Make New Things",
  description:
    "Create your own custom collections of pointless 16-bit things and share or sell them as Mystery Boxes on your profile.",
};

export default async function MakeThingsPage() {
  const session = await getCurrentSession();

  if (session) {
    let initialCollections: CreatorStudioCollectionSummary[] = [];
    let initialPayoutStatus: CreatorPayoutStatus = {
      stripeConfigured: false,
      connected: false,
      payoutsReady: false,
      stripeAccountId: null,
      cardPaymentsStatus: "unconfigured",
      payoutsStatus: "unconfigured",
      requirementsDue: false,
    };

    try {
      initialCollections = await listCreatorCollectionsForStudio(session.did);
    } catch (err) {
      console.warn("[/make] Could not load creator collections:", err);
    }

    try {
      initialPayoutStatus = await syncCreatorPayoutStatus(session.did);
    } catch (err) {
      console.warn("[/make] Could not sync Stripe payout status:", err);
    }

    return (
      <MakerStudioClient
        initialCollections={initialCollections}
        initialPayoutStatus={initialPayoutStatus}
        creatorHandle={session.handle}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Signed-Out Workshop Welcome */}
      <section
        aria-label="Make New Things Workshop"
        className="rpg-panel overflow-hidden"
      >
        <div className="candy-ribbon w-full" aria-hidden="true" />

        <div className="p-6 sm:p-10 text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#4be3a0] bg-[#160f24] px-3.5 py-1 font-pixel text-[10px] text-[#4be3a0]">
            <Sparkles className="h-3.5 w-3.5 text-[#ffd15c]" aria-hidden="true" />
            <span>NOW OPEN TO EVERYONE</span>
          </div>

          <div className="rpg-slot mx-auto flex h-24 w-24 items-center justify-center border-[#ffd15c]/70">
            <Hammer
              className="h-11 w-11 text-[#ffd15c]"
              aria-hidden="true"
            />
          </div>

          <h1 className="font-pixel text-xl sm:text-2xl text-[#ffd15c]">
            MAKE NEW THINGS
          </h1>

          <p className="mx-auto max-w-xl text-sm sm:text-base leading-relaxed text-[#fdf6e9]">
            Log in with your ATmosphere Account to craft your very own themed
            collections of pointless things—upload custom 512×512 PNG art or
            conjure sprites in our standard 16-bit style, store them in your own
            Personal Data Server (PDS), and offer them as free or paid Mystery
            Boxes on your profile!
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/login?returnTo=/make"
              className="rpg-btn-blue inline-flex items-center gap-2 px-6 py-3 font-pixel text-xs sm:text-sm"
            >
              LOGIN TO MAKE THINGS
            </Link>
            <Link
              href="/search"
              className="rpg-btn-secondary inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              FIND THINGS
            </Link>
          </div>
        </div>
      </section>

      {/* Workshop Capabilities */}
      <section
        aria-label="Workshop Features"
        className="grid gap-4 md:grid-cols-3"
      >
        <article className="rpg-panel-red p-5 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded bg-[#ff4d6d]/20 px-2.5 py-1 font-pixel text-[10px] text-[#ff99ac]">
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            CUSTOM SETS (5+)
          </div>
          <h2 className="font-pixel text-xs sm:text-sm text-[#fdf6e9]">
            Upload Sticker Art or Generate
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8]">
            Build sets of at least 5 one-of-a-kind items with guided writing
            tips, custom 512×512px PNG sticker cutouts, or sprites painted in
            Give a Thing&apos;s standard 16-bit style.
          </p>
        </article>

        <article className="rpg-panel-blue p-5 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded bg-[#4da6ff]/20 px-2.5 py-1 font-pixel text-[10px] text-[#8ec8ff]">
            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
            FREE OR PAID BOXES
          </div>
          <h2 className="font-pixel text-xs sm:text-sm text-[#fdf6e9]">
            Share Free or Sell Pulls
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8]">
            Let visitors unwrap 1 free mystery thing per day from your profile,
            or connect Stripe payouts to charge whatever price you choose per
            pull with no daily limit!
          </p>
        </article>

        <article className="rpg-panel p-5 space-y-2.5">
          <div className="inline-flex items-center gap-2 rounded bg-[#ffd15c]/20 px-2.5 py-1 font-pixel text-[10px] text-[#ffd15c]">
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            STORED IN YOUR PDS
          </div>
          <h2 className="font-pixel text-xs sm:text-sm text-[#fdf6e9]">
            Full Creator Control
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-[#cfc3e8]">
            Genesis records for every thing you make live in your own Personal
            Data Server (PDS), carrying your creator credit wherever they are
            traded—and revocable by you at any time.
          </p>
        </article>
      </section>
    </div>
  );
}
