import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { giveThingDirectly } from "@/lib/trading/trade-service";

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
      recipientDid?: string;
      note?: string;
    };
    if (!body.recipientDid) {
      return NextResponse.json(
        { error: "Recipient DID is required." },
        { status: 400 }
      );
    }

    const result = await giveThingDirectly({
      senderDid: session.did,
      thingTid: tid,
      recipientDid: body.recipientDid,
      note: body.note,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Could not transfer Thing.",
      },
      { status: 400 }
    );
  }
}
