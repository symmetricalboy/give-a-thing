import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isUnlimitedPullAccount } from "@/lib/generator/pull-service";
import {
  listCreatorCollectionsForStudio,
  publishCreatorCollection,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";
import { syncCreatorPayoutStatus } from "@/lib/stripe/connect";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (!isUnlimitedPullAccount(session)) {
    return NextResponse.json(
      { error: "Make New Things studio is currently restricted to @giveathing.com." },
      { status: 403 }
    );
  }

  try {
    const collections = await listCreatorCollectionsForStudio(session.did);
    return NextResponse.json({ collections });
  } catch (err) {
    console.error("[api/maker/collections GET] Error:", err);
    return NextResponse.json(
      { error: "Could not load creator collections." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (!isUnlimitedPullAccount(session)) {
    return NextResponse.json(
      { error: "Make New Things studio is currently restricted to @giveathing.com." },
      { status: 403 }
    );
  }

  try {
    const rawBody = (await req.json()) as { priceCents?: number };
    if (typeof rawBody?.priceCents === "number" && rawBody.priceCents > 0) {
      await syncCreatorPayoutStatus(session.did);
    }
    const collection = await publishCreatorCollection(session.did, rawBody);
    const collections = await listCreatorCollectionsForStudio(session.did);
    return NextResponse.json({ ok: true, collection, collections });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid collection draft." },
        { status: 400 }
      );
    }
    console.error("[api/maker/collections POST] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not publish collection. Please try again!",
      },
      { status: 400 }
    );
  }
}
