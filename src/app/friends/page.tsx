import React from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentSession } from "@/lib/session";
import { FriendsManager } from "@/components/FriendsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find My Friends",
  description:
    "Search your Bluesky Following, Followers, and Mutuals to find friends on Give a Thing.",
};

export default async function FriendsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/bag");
  }

  let autoImport = false;
  let following: Array<{
    did: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  }> = [];

  try {
    const db = getDb();
    const [viewerRows, followRows] = await Promise.all([
      db
        .select()
        .from(schema.users)
        .where(eq(schema.users.did, session.did))
        .limit(1),
      db
        .select()
        .from(schema.follows)
        .where(eq(schema.follows.followerDid, session.did)),
    ]);

    autoImport = viewerRows[0]?.autoImportBskyFollows ?? false;
    const subjectDids = followRows.map((f) => f.subjectDid);

    if (subjectDids.length > 0) {
      following = await db
        .select({
          did: schema.users.did,
          handle: schema.users.handle,
          displayName: schema.users.displayName,
          avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(inArray(schema.users.did, subjectDids));
    }
  } catch {
    // Graceful fallback if DB is offline locally
  }

  return (
    <FriendsManager
      viewerHandle={session.handle}
      initialAutoImport={autoImport}
      initialFollowing={following}
    />
  );
}
