import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Backpack, Gift, Users } from "lucide-react";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Things",
  description:
    "Sign in with Bluesky to view your pointless things, feature your Top 8, and find your friends.",
};

export default async function MyBagPage() {
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
        MY THINGS
      </h1>

      <p className="mx-auto max-w-md text-sm leading-relaxed text-[#cfc3e8]">
        Click <strong>Sign in with Bluesky</strong> in the top bar to see all
        the pointless things you own, pin your favorite Top 8, check your
        followers &amp; following, and find your Bluesky friends!
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
          href="/catalog"
          className="rpg-btn-blue inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          ALL THE THINGS
        </Link>
      </div>
    </section>
  );
}
