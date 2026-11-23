import { NextRequest, NextResponse } from "next/server";
import { searchDirectoryCollections } from "@/lib/queries";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const query = sp.get("q")?.trim() ?? "";
    const page = Number(sp.get("page") ?? "1") || 1;

    const res = await searchDirectoryCollections({
      query,
      page,
      pageSize: 24,
    });

    return NextResponse.json(res);
  } catch (err) {
    console.error("[api/collections/search] Error:", err);
    return NextResponse.json({
      collections: [],
      totalCount: 0,
      page: 1,
      pageSize: 24,
    });
  }
}
