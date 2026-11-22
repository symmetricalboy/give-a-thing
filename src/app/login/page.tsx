import React from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { AtmosphereLoginForm } from "@/components/AtmosphereLoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login",
  description:
    "Log in with your ATmosphere Account to unwrap daily pointless things and give things away to friends.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await getCurrentSession();
  const params = await searchParams;
  const safeReturnTo =
    params.returnTo &&
    params.returnTo.startsWith("/") &&
    !params.returnTo.startsWith("//")
      ? params.returnTo
      : "/";

  if (session) {
    redirect(safeReturnTo);
  }

  return (
    <section className="rpg-panel mx-auto max-w-lg p-6 sm:p-8 space-y-5">
      <div className="flex items-center gap-2 border-b-2 border-[#9e762a]/50 pb-3">
        <Sparkles className="h-4 w-4 text-[#ffd15c]" aria-hidden="true" />
        <h1 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
          LOGIN
        </h1>
      </div>

      <AtmosphereLoginForm returnTo={safeReturnTo} />
    </section>
  );
}
