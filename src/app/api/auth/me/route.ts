import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { clearSessionCookie, getCurrentSession } from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, session.did))
      .limit(1);
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        did: user.did,
        handle: user.handle,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        autoImportBskyFollows: user.autoImportBskyFollows,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
