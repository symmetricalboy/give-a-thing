import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/atproto/oauth";
import { getCurrentSession } from "@/lib/session";
import { createCreatorPayoutOnboardingLink } from "@/lib/stripe/connect";

export async function GET() {
  const appUrl = getPublicAppUrl();
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.redirect(`${appUrl}/login?returnTo=/make`);
  }

  try {
    const { url } = await createCreatorPayoutOnboardingLink(
      session.did,
      "onboard"
    );
    return NextResponse.redirect(url);
  } catch (err) {
    console.warn("[api/stripe/connect/refresh] Redirect fallback:", err);
    return NextResponse.redirect(`${appUrl}/make?stripe=error`);
  }
}
