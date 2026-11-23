import { NextRequest, NextResponse } from "next/server";
import {
  CollectionSoldOutError,
  CreatorCannotPullOwnBoxError,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";
import { createPaidCollectionCheckoutSession } from "@/lib/stripe/connect";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collectionTid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Log in with your ATmosphere Account to buy from this mystery box!" },
      { status: 401 }
    );
  }

  const { collectionTid } = await params;

  let returnContext: "profile" | "collection" = "profile";
  try {
    const body = (await req.json()) as { returnContext?: string };
    if (body?.returnContext === "collection") {
      returnContext = "collection";
    }
  } catch {
    // Empty request body defaults to "profile"
  }

  try {
    const checkout = await createPaidCollectionCheckoutSession({
      collectionTid,
      buyerDid: session.did,
      returnContext,
    });
    return NextResponse.json({ ok: true, ...checkout });
  } catch (err) {
    if (err instanceof CreatorCannotPullOwnBoxError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof CollectionSoldOutError) {
      return NextResponse.json(
        { error: err.message, soldOut: true },
        { status: 410 }
      );
    }
    console.error("[api/collections/checkout POST] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not start checkout for this mystery box.",
      },
      { status: 400 }
    );
  }
}
