import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getFeedPage } from "@/lib/queries";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    const modeParam = req.nextUrl.searchParams.get("mode");
    const mode = modeParam === "following" ? "following" : "global";
    const cursorRaw = req.nextUrl.searchParams.get("cursor");
    const cursorId = cursorRaw ? Number(cursorRaw) : undefined;

    const data = await getFeedPage({
      mode,
      viewerDid: session?.did ?? null,
      cursorId: Number.isFinite(cursorId) ? cursorId : undefined,
      limit: 25,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/feed] Error:", err);
    return NextResponse.json({ items: [], nextCursor: null });
  }
}
