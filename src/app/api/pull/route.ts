import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import {
  DailyPullAlreadyUsedError,
  DailyPullInProgressError,
  executeDailyPull,
} from "@/lib/generator/pull-service";
import { getDailyPullStatus } from "@/lib/queries";

export async function GET() {
  try {
    const session = await getCurrentSession();
    const status = await getDailyPullStatus(
      session?.did ?? null,
      session?.handle ?? null
    );
    return NextResponse.json(status);
  } catch (err) {
    console.error("[api/pull GET] Error:", err);
    return NextResponse.json(
      { error: "Could not check daily pull status." },
      { status: 500 }
    );
  }
}

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with Bluesky to get your daily thing!" },
      { status: 401 }
    );
  }

  try {
    const result = await executeDailyPull(session.did);
    return NextResponse.json({ thing: result });
  } catch (err) {
    if (err instanceof DailyPullAlreadyUsedError) {
      return NextResponse.json(
        { error: err.message, thingTid: err.thingTid, alreadyPulled: true },
        { status: 409 }
      );
    }
    if (err instanceof DailyPullInProgressError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error("[api/pull POST] Generation error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to conjure today's thing. Please try again!",
      },
      { status: 500 }
    );
  }
}
