import { NextRequest, NextResponse } from "next/server";
import {
  claimFromCollectionMysteryBox,
  CollectionAlreadyClaimedTodayError,
  CollectionSoldOutError,
  CreatorCannotPullOwnBoxError,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ collectionTid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Log in with your ATmosphere Account to draw from this mystery box!" },
      { status: 401 }
    );
  }

  const { collectionTid } = await params;

  try {
    const result = await claimFromCollectionMysteryBox({
      collectionTid,
      claimerDid: session.did,
    });
    return NextResponse.json({ ok: true, thing: result });
  } catch (err) {
    if (err instanceof CreatorCannotPullOwnBoxError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof CollectionAlreadyClaimedTodayError) {
      return NextResponse.json(
        { error: err.message, alreadyClaimedToday: true },
        { status: 409 }
      );
    }
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
            : "Could not draw from this mystery box right now.",
      },
      { status: 400 }
    );
  }
}
