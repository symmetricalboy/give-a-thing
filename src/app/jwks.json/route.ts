import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/atproto/oauth";

export async function GET() {
  const client = await getOAuthClient();
  return NextResponse.json(client.jwks);
}
