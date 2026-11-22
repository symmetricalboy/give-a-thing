import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentSession } from "@/lib/session";
import {
  discoverBlueskyNetworkOnApp,
  followPlayer,
  importAllBlueskyFriends,
  unfollowPlayer,
} from "@/lib/social/follows";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const scanBsky = req.nextUrl.searchParams.get("scanBsky") === "1";
  const db = getDb();

  const [viewerRows, followRows, followerRows] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, session.did))
      .limit(1),
    db
      .select()
      .from(schema.follows)
      .where(eq(schema.follows.followerDid, session.did)),
    db
      .select()
      .from(schema.follows)
      .where(eq(schema.follows.subjectDid, session.did)),
  ]);

  const subjectDids = followRows.map((f) => f.subjectDid);
  const followerDids = followerRows.map((f) => f.followerDid);
  const allLookupDids = Array.from(new Set([...subjectDids, ...followerDids]));

  const userRows =
    allLookupDids.length > 0
      ? await db
          .select({
            did: schema.users.did,
            handle: schema.users.handle,
            displayName: schema.users.displayName,
            avatarUrl: schema.users.avatarUrl,
          })
          .from(schema.users)
          .where(inArray(schema.users.did, allLookupDids))
      : [];

  const userMap = new Map(userRows.map((u) => [u.did, u]));
  const followedUsers = subjectDids
    .map((d) => userMap.get(d))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const followerUsers = followerDids
    .map((d) => userMap.get(d))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  const bskyNetwork = scanBsky
    ? await discoverBlueskyNetworkOnApp(session.did)
    : null;

  return NextResponse.json({
    autoImportBskyFollows: viewerRows[0]?.autoImportBskyFollows ?? false,
    following: followedUsers,
    followers: followerUsers,
    bskyCandidates: bskyNetwork?.following ?? [],
    bskyNetwork,
  });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      action?:
        | "follow"
        | "unfollow"
        | "import_all_bsky"
        | "import_dids"
        | "set_auto_import";
      subjectDid?: string;
      dids?: string[];
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

    if (body.action === "import_dids" && Array.isArray(body.dids)) {
      let importedCount = 0;
      for (const targetDid of body.dids.slice(0, 300)) {
        if (typeof targetDid !== "string" || !targetDid.startsWith("did:")) {
          continue;
        }
        const res = await followPlayer({
          followerDid: session.did,
          subjectDid: targetDid,
          source: "bsky_import",
        });
        if (res.created) importedCount++;
      }
      return NextResponse.json({ ok: true, importedCount });
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
          err instanceof Error
            ? err.message
            : "Could not update social graph.",
      },
      { status: 400 }
    );
  }
}
