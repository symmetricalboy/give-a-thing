import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addItemsToCreatorCollection,
  listCreatorCollectionsForStudio,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";

export async function POST(
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
    const rawBody = await req.json();
    const result = await addItemsToCreatorCollection({
      creatorDid: session.did,
      collectionTid,
      rawInput: rawBody,
    });
    const collections = await listCreatorCollectionsForStudio(session.did);

    return NextResponse.json({
      ok: true,
      ...result,
      collections,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid collection items." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not add items to this collection.",
      },
      { status: 400 }
    );
  }
}
