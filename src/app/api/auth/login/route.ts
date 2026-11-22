import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { USER_OAUTH_SCOPES } from "@/lib/lexicons";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      handle?: string;
      returnTo?: string;
    };
    const rawHandle = body.handle?.trim().replace(/^@/, "");
    if (!rawHandle) {
      return NextResponse.json(
        { error: "Please enter your Bluesky handle (e.g. alice.bsky.social)." },
        { status: 400 }
      );
    }

    const safeReturnTo =
      body.returnTo && body.returnTo.startsWith("/") && !body.returnTo.startsWith("//")
        ? body.returnTo
        : "/";

    const client = await getOAuthClient();
    const authUrl = await client.authorize(rawHandle, {
      scope: USER_OAUTH_SCOPES,
      state: JSON.stringify({ returnTo: safeReturnTo }),
    });

    return NextResponse.json({ url: authUrl.toString() });
  } catch (err) {
    console.error("[auth/login] OAuth authorize error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not resolve Bluesky handle or reach your PDS.",
      },
      { status: 400 }
    );
  }
}
