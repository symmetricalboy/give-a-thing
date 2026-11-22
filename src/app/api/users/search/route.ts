import { NextRequest, NextResponse } from "next/server";
import { searchDirectoryUsers } from "@/lib/queries";
import { getCurrentSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const session = await getCurrentSession();
    const users = await searchDirectoryUsers({
      query: q,
      viewerDid: session?.did ?? null,
      limit: 24,
    });
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[api/users/search] Error:", err);
    return NextResponse.json({ users: [] });
  }
}
