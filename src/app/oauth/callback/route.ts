import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getOAuthClient, getPublicAppUrl } from "@/lib/atproto/oauth";
import { resolveActorProfile } from "@/lib/atproto/public-bsky";
import { flushPendingPdsSyncsForUser } from "@/lib/atproto/user-pds";
import {
  importAllBlueskyFriends,
  onboardNewUserAutoFollows,
} from "@/lib/social/follows";
import { setSessionCookie } from "@/lib/session";

export async function GET(req: NextRequest) {
  const appUrl = getPublicAppUrl();
  try {
    const client = await getOAuthClient();
    const params = req.nextUrl.searchParams;
    const { session, state } = await client.callback(params);

    const did = session.did;
    const profile = await resolveActorProfile(did);
    const handle = profile?.handle ?? did;
    const displayName = profile?.displayName ?? null;
    const avatarUrl = profile?.avatar ?? null;

    const db = getDb();
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, did))
      .limit(1);

    const isNewUser = existing.length === 0;

    await db
      .insert(schema.users)
      .values({
        did,
        handle,
        displayName,
        avatarUrl,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.users.did,
        set: {
          handle,
          displayName,
          avatarUrl,
          updatedAt: new Date(),
        },
      });

    await setSessionCookie({ did, handle });

    // Background-safe fire-and-forget tasks so sign-in redirect stays snappy
    void (async () => {
      try {
        await flushPendingPdsSyncsForUser(did);
        if (isNewUser) {
          await onboardNewUserAutoFollows(did);
        } else if (existing[0]?.autoImportBskyFollows) {
          await importAllBlueskyFriends(did, "bsky_auto");
        }
      } catch (bgErr) {
        console.warn("[oauth/callback] Background sync warning:", bgErr);
      }
    })();

    let returnTo = "/";
    if (state) {
      try {
        const parsed = JSON.parse(state) as { returnTo?: string };
        if (
          parsed.returnTo &&
          parsed.returnTo.startsWith("/") &&
          !parsed.returnTo.startsWith("//")
        ) {
          returnTo = parsed.returnTo;
        }
      } catch {
        // Ignore malformed state payload
      }
    }

    return NextResponse.redirect(new URL(returnTo, appUrl));
  } catch (err) {
    console.error("[oauth/callback] OAuth callback failed:", err);
    const errUrl = new URL("/", appUrl);
    errUrl.searchParams.set("authError", "Bluesky sign-in was cancelled or failed.");
    return NextResponse.redirect(errUrl);
  }
}
