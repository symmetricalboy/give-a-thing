import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCreatorCollectionsForStudio,
  updateCreatorCollectionPricing,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";
import { syncCreatorPayoutStatus } from "@/lib/stripe/connect";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ collectionTid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { collectionTid } = await params;

  try {
    const rawBody = (await req.json()) as { priceCents?: number };
    if (typeof rawBody?.priceCents === "number" && rawBody.priceCents > 0) {
      await syncCreatorPayoutStatus(session.did);
    }

    const updated = await updateCreatorCollectionPricing({
      creatorDid: session.did,
      collectionTid,
      rawInput: rawBody,
    });
    const collections = await listCreatorCollectionsForStudio(session.did);

    return NextResponse.json({
      ok: true,
      collection: updated,
      collections,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid pricing input." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not update collection pricing.",
      },
      { status: 400 }
    );
  }
}
