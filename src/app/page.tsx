import React from "react";
import { getCurrentSession } from "@/lib/session";
import {
  getDailyPullStatus,
  getFeedPage,
  type FeedItemDTO,
} from "@/lib/queries";
import {
  getNextUtcMidnightIso,
  isUnlimitedPullAccount,
} from "@/lib/generator/pull-service";
import {
  DailyParcelPedestal,
  type TodaysThingView,
} from "@/components/DailyParcelPedestal";
import { FeedTimeline } from "@/components/FeedTimeline";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();

  let hasPulled = false;
  let unlimitedPulls = session ? isUnlimitedPullAccount(session) : false;
  let nextPullUtcIso = getNextUtcMidnightIso();
  let todaysThing: TodaysThingView | null = null;
  let feedItems: FeedItemDTO[] = [];
  let feedCursor: number | null = null;

  try {
    const [pullStatus, globalFeed] = await Promise.all([
      getDailyPullStatus(session?.did ?? null, session?.handle ?? null),
      getFeedPage({
        mode: "global",
        viewerDid: session?.did ?? null,
        limit: 25,
      }),
    ]);

    hasPulled = pullStatus.hasPulledToday;
    unlimitedPulls = pullStatus.unlimitedPulls;
    nextPullUtcIso = pullStatus.nextPullUtcIso;
    todaysThing = pullStatus.todaysThing;
    feedItems = globalFeed.items;
    feedCursor = globalFeed.nextCursor;
  } catch {
    // Graceful fallback when DATABASE_URL is not yet connected locally
  }

  return (
    <div className="space-y-8">
      <DailyParcelPedestal
        authenticated={Boolean(session)}
        initialHasPulled={hasPulled}
        initialUnlimitedPulls={unlimitedPulls}
        initialNextPullUtcIso={nextPullUtcIso}
        initialTodaysThing={todaysThing}
      />

      <FeedTimeline
        initialGlobalItems={feedItems}
        initialGlobalCursor={feedCursor}
        authenticated={Boolean(session)}
      />
    </div>
  );
}
