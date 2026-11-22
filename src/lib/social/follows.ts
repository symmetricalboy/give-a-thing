import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { nextTid } from "@/lib/lexicons";
import {
  fetchAllBlueskyFollows,
  fetchBlueskyFollowers,
  type BlueskyActorSummary,
} from "@/lib/atproto/public-bsky";
import {
  deleteUserFollowOnPds,
  writeUserFollowOnPds,
} from "@/lib/atproto/user-pds";

export interface BlueskyFriendCandidate {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  alreadyFollowing: boolean;
}

export interface BlueskyNetworkDiscovery {
  following: BlueskyFriendCandidate[];
  followers: BlueskyFriendCandidate[];
  mutuals: BlueskyFriendCandidate[];
}

export async function followPlayer(params: {
  followerDid: string;
  subjectDid: string;
  source: "manual" | "bsky_import" | "bsky_auto";
}): Promise<{ created: boolean }> {
  if (params.followerDid === params.subjectDid) {
    return { created: false };
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(schema.follows)
    .where(
      and(
        eq(schema.follows.followerDid, params.followerDid),
        eq(schema.follows.subjectDid, params.subjectDid)
      )
    )
    .limit(1);

  if (existing[0]) {
    return { created: false };
  }

  const followTid = nextTid();
  const now = new Date();

  const atUri = await writeUserFollowOnPds({
    followerDid: params.followerDid,
    followTid,
    subjectDid: params.subjectDid,
    source: params.source,
    createdAtIso: now.toISOString(),
  });

  await db
    .insert(schema.follows)
    .values({
      followerDid: params.followerDid,
      subjectDid: params.subjectDid,
      followTid,
      source: params.source,
      atUri,
      createdAt: now,
    })
    .onConflictDoNothing();

  return { created: true };
}

export async function unfollowPlayer(
  followerDid: string,
  subjectDid: string
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.follows)
    .where(
      and(
        eq(schema.follows.followerDid, followerDid),
        eq(schema.follows.subjectDid, subjectDid)
      )
    )
    .limit(1);

  if (!existing[0]) return;

  await deleteUserFollowOnPds(followerDid, existing[0].followTid);
  await db
    .delete(schema.follows)
    .where(
      and(
        eq(schema.follows.followerDid, followerDid),
        eq(schema.follows.subjectDid, subjectDid)
      )
    );
}

/**
 * Scans the viewer's Bluesky Following, Followers, and Mutuals in parallel,
 * refreshes `bsky_known_follows`, and returns Give a Thing players grouped by
 * `following`, `followers`, and `mutuals`.
 */
export async function discoverBlueskyNetworkOnApp(
  viewerDid: string
): Promise<BlueskyNetworkDiscovery> {
  const db = getDb();
  const [bskyFollows, bskyFollowers] = await Promise.all([
    fetchAllBlueskyFollows(viewerDid, 15),
    fetchBlueskyFollowers(viewerDid, 15),
  ]);

  await db
    .update(schema.users)
    .set({ lastBskySyncAt: new Date() })
    .where(eq(schema.users.did, viewerDid));

  // Refresh cached Bluesky follow edges in batches of 250 for auto-import
  await db
    .delete(schema.bskyKnownFollows)
    .where(eq(schema.bskyKnownFollows.followerDid, viewerDid));

  for (let i = 0; i < bskyFollows.length; i += 250) {
    const slice = bskyFollows.slice(i, i + 250);
    await db
      .insert(schema.bskyKnownFollows)
      .values(
        slice.map((f) => ({
          followerDid: viewerDid,
          targetDid: f.did,
        }))
      )
      .onConflictDoNothing();
  }

  const followingDidSet = new Set(bskyFollows.map((f) => f.did));
  const followerDidSet = new Set(bskyFollowers.map((f) => f.did));
  const combinedDids = Array.from(
    new Set([...followingDidSet, ...followerDidSet])
  ).filter((did) => did !== viewerDid);

  if (combinedDids.length === 0) {
    return { following: [], followers: [], mutuals: [] };
  }

  const registeredRows: Array<typeof schema.users.$inferSelect> = [];
  for (let i = 0; i < combinedDids.length; i += 250) {
    const chunk = combinedDids.slice(i, i + 250);
    const found = await db
      .select()
      .from(schema.users)
      .where(inArray(schema.users.did, chunk));
    registeredRows.push(...found);
  }

  if (registeredRows.length === 0) {
    return { following: [], followers: [], mutuals: [] };
  }

  const existingFollows = await db
    .select()
    .from(schema.follows)
    .where(eq(schema.follows.followerDid, viewerDid));
  const appFollowingSet = new Set(existingFollows.map((f) => f.subjectDid));

  const toCandidate = (
    u: typeof schema.users.$inferSelect
  ): BlueskyFriendCandidate => ({
    did: u.did,
    handle: u.handle,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    alreadyFollowing: appFollowingSet.has(u.did),
  });

  const following: BlueskyFriendCandidate[] = [];
  const followers: BlueskyFriendCandidate[] = [];
  const mutuals: BlueskyFriendCandidate[] = [];

  for (const u of registeredRows) {
    if (u.did === viewerDid) continue;
    const cand = toCandidate(u);
    const inFollowing = followingDidSet.has(u.did);
    const inFollowers = followerDidSet.has(u.did);
    if (inFollowing) following.push(cand);
    if (inFollowers) followers.push(cand);
    if (inFollowing && inFollowers) mutuals.push(cand);
  }

  return { following, followers, mutuals };
}

export async function discoverBlueskyFriendsOnApp(
  viewerDid: string
): Promise<BlueskyFriendCandidate[]> {
  const net = await discoverBlueskyNetworkOnApp(viewerDid);
  return net.following;
}

export async function importAllBlueskyFriends(
  viewerDid: string,
  source: "bsky_import" | "bsky_auto" = "bsky_import"
): Promise<{ importedCount: number; totalMatches: number }> {
  const candidates = await discoverBlueskyFriendsOnApp(viewerDid);
  let importedCount = 0;

  for (const c of candidates) {
    if (!c.alreadyFollowing) {
      const res = await followPlayer({
        followerDid: viewerDid,
        subjectDid: c.did,
        source,
      });
      if (res.created) importedCount++;
    }
  }

  return { importedCount, totalMatches: candidates.length };
}

/**
 * Triggered when a brand-new user joins Give a Thing:
 * 1. Checks `bsky_known_follows` for any existing opt-in users who already follow `newUserDid`.
 * 2. Also queries `app.bsky.graph.getFollowers` on Bluesky for `newUserDid` and intersects
 *    with existing Give a Thing users where `auto_import_bsky_follows = true`.
 */
export async function onboardNewUserAutoFollows(
  newUserDid: string
): Promise<number> {
  const db = getDb();

  const cachedFollowerRows = await db
    .select({ followerDid: schema.bskyKnownFollows.followerDid })
    .from(schema.bskyKnownFollows)
    .where(eq(schema.bskyKnownFollows.targetDid, newUserDid));

  const liveFollowers = await fetchBlueskyFollowers(newUserDid, 10);
  const candidateFollowerDids = Array.from(
    new Set([
      ...cachedFollowerRows.map((r) => r.followerDid),
      ...liveFollowers.map((f) => f.did),
    ])
  );

  if (candidateFollowerDids.length === 0) return 0;

  const optInUsers: Array<{ did: string }> = [];
  for (let i = 0; i < candidateFollowerDids.length; i += 250) {
    const chunk = candidateFollowerDids.slice(i, i + 250);
    const rows = await db
      .select({ did: schema.users.did })
      .from(schema.users)
      .where(
        and(
          inArray(schema.users.did, chunk),
          eq(schema.users.autoImportBskyFollows, true)
        )
      );
    optInUsers.push(...rows);
  }

  let autoFollowed = 0;
  for (const u of optInUsers) {
    const res = await followPlayer({
      followerDid: u.did,
      subjectDid: newUserDid,
      source: "bsky_auto",
    });
    if (res.created) autoFollowed++;
  }

  return autoFollowed;
}
