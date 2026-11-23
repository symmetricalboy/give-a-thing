import { NextRequest, NextResponse } from "next/server";
import { CollectionSoldOutError } from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";
import {
  fulfillPaidCollectionPurchase,
  releasePendingCollectionPurchase,
} from "@/lib/stripe/connect";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      checkoutSessionId?: string;
      cancelPurchaseId?: string;
    };

    if (body.cancelPurchaseId) {
      await releasePendingCollectionPurchase({
        purchaseId: body.cancelPurchaseId,
        actorDid: session.did,
      });
      return NextResponse.json({ ok: true, cancelled: true });
    }

    if (!body.checkoutSessionId) {
      return NextResponse.json(
        { error: "Missing checkoutSessionId." },
        { status: 400 }
      );
    }

    const thing = await fulfillPaidCollectionPurchase({
      checkoutSessionId: body.checkoutSessionId,
      viewerDid: session.did,
    });

    return NextResponse.json({ ok: true, thing });
  } catch (err) {
    if (err instanceof CollectionSoldOutError) {
      return NextResponse.json(
        { error: err.message, soldOut: true },
        { status: 410 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not verify checkout session.",
      },
      { status: 400 }
    );
  }
}
