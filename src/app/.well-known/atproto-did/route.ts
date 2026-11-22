import { NextResponse } from "next/server";

export async function GET() {
  const appDid = process.env.NEXT_PUBLIC_APP_ATPROTO_DID?.trim();
  if (!appDid) {
    return new NextResponse("App ATProto DID not configured", { status: 404 });
  }
  return new NextResponse(appDid, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
