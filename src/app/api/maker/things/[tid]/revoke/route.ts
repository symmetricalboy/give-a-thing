import { NextRequest, NextResponse } from "next/server";
import { revokeAndDestroyCreatedThing } from "@/lib/maker/collection-service";
import { getCurrentSession } from "@/lib/session";

export async function POST(
  _req: NextRequest,
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
    const result = await revokeAndDestroyCreatedThing({
      thingTid: tid,
      actorDid: session.did,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not revoke and destroy this thing.",
      },
      { status: 400 }
    );
  }
}
