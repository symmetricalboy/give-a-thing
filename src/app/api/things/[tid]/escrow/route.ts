import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { createEscrowOffer } from "@/lib/trading/trade-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { tid } = await params;
  try {
    const body = (await req.json()) as {
      recipientActor?: string;
      note?: string;
    };
    if (!body.recipientActor?.trim()) {
      return NextResponse.json(
        { error: "Recipient Bluesky handle or DID is required." },
        { status: 400 }
      );
    }

    const result = await createEscrowOffer({
      senderDid: session.did,
      thingTid: tid,
      recipientActor: body.recipientActor,
      note: body.note,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not set aside Thing.",
      },
      { status: 400 }
    );
  }
}
