import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import {
  reorderFavoriteThing,
  toggleFavoriteThing,
} from "@/lib/social/favorites";

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
      action?: "toggle" | "reorder";
      thingTid?: string;
      direction?: "left" | "right";
    };

    if (!body.thingTid) {
      return NextResponse.json(
        { error: "thingTid is required." },
        { status: 400 }
      );
    }

    if (body.action === "reorder" && body.direction) {
      await reorderFavoriteThing({
        userDid: session.did,
        thingTid: body.thingTid,
        direction: body.direction,
      });
      return NextResponse.json({ ok: true });
    }

    const res = await toggleFavoriteThing({
      userDid: session.did,
      thingTid: body.thingTid,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not update Top 8 favorites.",
      },
      { status: 400 }
    );
  }
}
