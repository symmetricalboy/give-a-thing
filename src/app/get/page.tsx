import React from "react";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/session";
import { getDailyPullStatus } from "@/lib/queries";
import {
  getNextUtcMidnightIso,
  isUnlimitedPullAccount,
} from "@/lib/generator/pull-service";
import { DailyParcelPedestal } from "@/components/DailyParcelPedestal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get a Thing",
  description:
    "Unwrap your daily mystery parcel to receive a one-of-a-kind pointless 16-bit thing.",
};

export default async function GetAThingPage() {
  const session = await getCurrentSession();

  let hasPulled = false;
  let unlimitedPulls = session ? isUnlimitedPullAccount(session) : false;
  let nextPullUtcIso = getNextUtcMidnightIso();

  try {
    const pullStatus = await getDailyPullStatus(
      session?.did ?? null,
      session?.handle ?? null
    );
    hasPulled = pullStatus.hasPulledToday;
    unlimitedPulls = pullStatus.unlimitedPulls;
    nextPullUtcIso = pullStatus.nextPullUtcIso;
  } catch {
    // Graceful fallback when DATABASE_URL is not yet connected locally
  }

  return (
    <div className="space-y-6">
      <DailyParcelPedestal
        authenticated={Boolean(session)}
        initialHasPulled={hasPulled}
        initialUnlimitedPulls={unlimitedPulls}
        initialNextPullUtcIso={nextPullUtcIso}
      />
    </div>
  );
}
