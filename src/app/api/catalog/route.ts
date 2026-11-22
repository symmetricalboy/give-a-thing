import { NextRequest, NextResponse } from "next/server";
import { searchDiscoveryCatalog } from "@/lib/queries";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const query = sp.get("q") ?? "";
    const semantic = sp.get("semantic") === "1";
    const category = sp.get("category") ?? "";
    const sortParam = sp.get("sort");
    const sort =
      sortParam === "oldest" || sortParam === "hot_potato"
        ? sortParam
        : "newest";
    const page = Number(sp.get("page") ?? "1") || 1;

    const result = await searchDiscoveryCatalog({
      query,
      semantic,
      category: category || undefined,
      sort,
      page,
      pageSize: 24,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/catalog] Error:", err);
    return NextResponse.json({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 24,
    });
  }
}
