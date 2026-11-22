import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { searchBlueskyActors } from "@/lib/atproto/public-bsky";
import { getCurrentSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ actors: [] });
  }

  const session = await getCurrentSession();
  const actors = await searchBlueskyActors(q, 10);
  const filtered = actors.filter((a) => a.did !== session?.did);

  if (filtered.length === 0) {
    return NextResponse.json({ actors: [] });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({ did: schema.users.did })
      .from(schema.users)
      .where(
        inArray(
          schema.users.did,
          filtered.map((a) => a.did)
        )
      );
    const registeredSet = new Set(rows.map((r) => r.did));

    return NextResponse.json({
      actors: filtered.map((a) => ({
        did: a.did,
        handle: a.handle,
        displayName: a.displayName ?? null,
        avatarUrl: a.avatar ?? null,
        isRegisteredPlayer: registeredSet.has(a.did),
      })),
    });
  } catch {
    return NextResponse.json({
      actors: filtered.map((a) => ({
        did: a.did,
        handle: a.handle,
        displayName: a.displayName ?? null,
        avatarUrl: a.avatar ?? null,
        isRegisteredPlayer: false,
      })),
    });
  }
}
