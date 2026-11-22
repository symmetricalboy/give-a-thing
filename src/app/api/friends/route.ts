import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentSession } from "@/lib/session";
import {
  discoverBlueskyFriendsOnApp,
  followPlayer,
  importAllBlueskyFriends,
  unfollowPlayer,
} from "@/lib/social/follows";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const scanBsky = req.nextUrl.searchParams.get("scanBsky") === "1";
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

  const subjectDids = followRows.map((f) => f.subjectDid);
  const followedUsers =
    subjectDids.length > 0
      ? await db
          .select({
            did: schema.users.did,
            handle: schema.users.handle,
            displayName: schema.users.displayName,
            avatarUrl: schema.users.avatarUrl,
          })
          .from(schema.users)
          .where(inArray(schema.users.did, subjectDids))
      : [];

  const bskyCandidates = scanBsky
    ? await discoverBlueskyFriendsOnApp(session.did)
    : [];

  return NextResponse.json({
    autoImportBskyFollows: viewerRows[0]?.autoImportBskyFollows ?? false,
    following: followedUsers,
    bskyCandidates,
  });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action?: "follow" | "unfollow" | "import_all_bsky" | "set_auto_import";
      subjectDid?: string;
      source?: "manual" | "bsky_import";
      enabled?: boolean;
    };

    const db = getDb();

    if (body.action === "follow" && body.subjectDid) {
      const res = await followPlayer({
        followerDid: session.did,
        subjectDid: body.subjectDid,
        source: body.source ?? "manual",
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "unfollow" && body.subjectDid) {
      await unfollowPlayer(session.did, body.subjectDid);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "import_all_bsky") {
      const stats = await importAllBlueskyFriends(session.did, "bsky_import");
      return NextResponse.json({ ok: true, ...stats });
    }

    if (body.action === "set_auto_import" && typeof body.enabled === "boolean") {
      await db
        .update(schema.users)
        .set({
          autoImportBskyFollows: body.enabled,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, session.did));

      let importedCount = 0;
      if (body.enabled) {
        const res = await importAllBlueskyFriends(session.did, "bsky_auto");
        importedCount = res.importedCount;
      }

      return NextResponse.json({
        ok: true,
        autoImportBskyFollows: body.enabled,
        importedCount,
      });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not update social graph.",
      },
      { status: 400 }
    );
  }
}
