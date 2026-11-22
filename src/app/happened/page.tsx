import React from "react";
import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getFeedPage, type FeedItemDTO } from "@/lib/queries";
import { FeedTimeline } from "@/components/FeedTimeline";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Things That Happened",
  description:
    "Watch daily pulls and gift handoffs roll by live across Give a Thing.",
};

export default async function ThingsThatHappenedPage() {
  const session = await getCurrentSession();

  let feedItems: FeedItemDTO[] = [];
  let feedCursor: number | null = null;

  try {
    const globalFeed = await getFeedPage({
      mode: "global",
      viewerDid: session?.did ?? null,
      limit: 25,
    });
    feedItems = globalFeed.items;
    feedCursor = globalFeed.nextCursor;
  } catch {
    // Graceful fallback when DATABASE_URL is not yet connected locally
  }

  return (
    <div className="space-y-6">
      <section className="rpg-panel-blue p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <Activity className="h-5 w-5 text-[#8ec8ff]" aria-hidden="true" />
          <h1 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
            THINGS THAT HAPPENED
          </h1>
        </div>
        <p className="mt-1.5 text-xs sm:text-sm text-[#cfc3e8]">
          Every newly unwrapped thing and every friendly handoff across the
          world—live as it happens!
        </p>
      </section>

      <FeedTimeline
        initialGlobalItems={feedItems}
        initialGlobalCursor={feedCursor}
        authenticated={Boolean(session)}
      />
    </div>
  );
}
