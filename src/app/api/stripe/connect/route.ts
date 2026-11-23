import { NextRequest, NextResponse } from "next/server";
import { isUnlimitedPullAccount } from "@/lib/generator/pull-service";
import { getCurrentSession } from "@/lib/session";
import {
  createCreatorPayoutOnboardingLink,
  syncCreatorPayoutStatus,
} from "@/lib/stripe/connect";

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
    const status = await syncCreatorPayoutStatus(session.did);
    return NextResponse.json({ status });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not check payout status.",
      },
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
    let mode: "onboard" | "update" = "onboard";
    try {
      const body = (await req.json()) as { mode?: string };
      if (body?.mode === "update") {
        mode = "update";
      }
    } catch {
      // Empty POST body defaults to "onboard"
    }

    const link = await createCreatorPayoutOnboardingLink(session.did, mode);
    return NextResponse.json({ ok: true, ...link });
  } catch (err) {
    console.error("[api/stripe/connect POST] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not start Stripe payout setup.",
      },
      { status: 400 }
    );
  }
}
