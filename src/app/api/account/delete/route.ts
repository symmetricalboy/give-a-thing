import { NextRequest, NextResponse } from "next/server";
import { permanentlyDeleteUserAccount } from "@/lib/account/delete-account";
import { clearSessionCookie, getCurrentSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Please log in with your ATmosphere Account first." },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as { confirmText?: string };
    if (body.confirmText?.trim() !== "DELETE") {
      return NextResponse.json(
        { error: 'Please type "DELETE" to confirm permanent deletion.' },
        { status: 400 }
      );
    }

    const result = await permanentlyDeleteUserAccount(
      session.did,
      session.handle
    );
    await clearSessionCookie();

    return NextResponse.json({
      ok: true,
      deletedPdsRecords: result.deletedPdsRecords,
      returnedThings: result.returnedThings,
    });
  } catch (err) {
    console.error("[api/account/delete] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not delete Give a Thing records. Please try again.",
      },
      { status: 400 }
    );
  }
}
