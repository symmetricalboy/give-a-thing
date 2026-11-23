import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listCreatorCollectionsForStudio,
  updateCreatorCollectionThing,
} from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { tid } = await params;

  try {
    const rawBody = await req.json();
    const updated = await updateCreatorCollectionThing({
      creatorDid: session.did,
      thingTid: tid,
      rawInput: rawBody,
    });
    const collections = await listCreatorCollectionsForStudio(session.did);

    return NextResponse.json({
      ok: true,
      thing: updated,
      collections,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid thing details." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not update this thing's details.",
      },
      { status: 400 }
    );
  }
}
