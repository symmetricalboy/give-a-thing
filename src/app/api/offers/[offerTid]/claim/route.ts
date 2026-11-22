import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { claimEscrowOffer } from "@/lib/trading/trade-service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ offerTid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with Bluesky to claim your Thing!" },
      { status: 401 }
    );
  }

  const { offerTid } = await params;
  try {
    const result = await claimEscrowOffer({
      claimerDid: session.did,
      offerTid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not claim Thing.",
      },
      { status: 400 }
    );
  }
}
