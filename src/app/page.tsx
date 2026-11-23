import React from "react";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentSession } from "@/lib/session";
import { HomeLandingHero } from "@/components/HomeLandingHero";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();
  let totalThingsCount = 0;

  try {
    const db = getDb();
    const res = await db.select({ value: count() }).from(schema.things);
    totalThingsCount = Number(res[0]?.value ?? 0);
  } catch {
    // Graceful fallback when DATABASE_URL is not yet connected locally
  }

  return (
    <HomeLandingHero
      totalThingsCount={totalThingsCount}
      authenticated={Boolean(session)}
    />
  );
}
