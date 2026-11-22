import React from "react";
import type { Metadata } from "next";
import { isUnlimitedPullAccount } from "@/lib/generator/pull-service";
import { getCurrentSession } from "@/lib/session";
import { OtherThingsClient } from "@/components/OtherThingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Other Things",
  description:
    "Support links, Privacy Policy, Terms of Service, Code of Conduct, and account record controls for Give a Thing.",
};

export default async function OtherThingsPage() {
  const session = await getCurrentSession();

  return (
    <OtherThingsClient
      viewerHandle={session?.handle ?? null}
      isSystemAccount={session ? isUnlimitedPullAccount(session) : false}
    />
  );
}
