import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Backpack, Gift, Search } from "lucide-react";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Things",
  description:
    "Log in with your ATmosphere Account to view your pointless things, feature your Top 8, and find your friends.",
};

export default async function YourProfileRedirectPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(`/u/${encodeURIComponent(session.handle)}`);
  }

  return (
    <section className="rpg-panel mx-auto max-w-2xl p-6 sm:p-10 text-center space-y-5">
      <div className="rpg-slot mx-auto flex h-20 w-20 items-center justify-center border-[#ff4d6d]/60">
        <Backpack className="h-10 w-10 text-[#ffd15c]" aria-hidden="true" />
      </div>

      <h1 className="font-pixel text-base sm:text-lg text-[#ffd15c]">
        YOUR THINGS
      </h1>

      <p className="mx-auto max-w-md text-sm leading-relaxed text-[#cfc3e8]">
        Click{" "}
        <Link
          href="/login?returnTo=/profile"
          className="font-semibold text-[#8ec8ff] underline hover:text-[#ffd15c]"
        >
          LOGIN
        </Link>{" "}
        in the top bar with your ATmosphere Account to see all the pointless
        things you own, pin your favorite Top 8, check your followers &amp;
        following, and find your friends!
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href="/get"
          className="rpg-btn-red inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
        >
          <Gift className="h-4 w-4" aria-hidden="true" />
          GET A THING
        </Link>
        <Link
          href="/search"
          className="rpg-btn-blue inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          FIND THINGS
        </Link>
      </div>
    </section>
  );
}
