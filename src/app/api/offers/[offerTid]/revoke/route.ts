import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { revokeEscrowOffer } from "@/lib/trading/trade-service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ offerTid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { offerTid } = await params;
  try {
    const result = await revokeEscrowOffer({
      senderDid: session.did,
      offerTid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not revoke offer.",
      },
      { status: 400 }
    );
  }
}
