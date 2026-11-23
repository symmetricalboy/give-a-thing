import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CollectionPageClient } from "@/components/CollectionPageClient";
import { getCollectionLandingPageData } from "@/lib/queries";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collectionTid: string }>;
}): Promise<Metadata> {
  const { collectionTid } = await params;
  try {
    const data = await getCollectionLandingPageData(collectionTid);
    if (!data) return { title: "Collection Not Found" };
    return {
      title: `${data.collection.name} — Mystery Box by @${data.creator.handle}`,
      description:
        data.collection.description ??
        `Explore revealed things and unwrap from ${data.collection.name}, a Mystery Box collection created by @${data.creator.handle} on Give a Thing.`,
    };
  } catch {
    return { title: "Mystery Box Collection" };
  }
}

export default async function CollectionLandingPage({
  params,
}: {
  params: Promise<{ collectionTid: string }>;
}) {
  const { collectionTid } = await params;
  const session = await getCurrentSession();

  let data: Awaited<ReturnType<typeof getCollectionLandingPageData>> = null;
  try {
    data = await getCollectionLandingPageData(
      collectionTid,
      session?.did ?? null
    );
  } catch {
    notFound();
  }

  if (!data) {
    notFound();
  }

  return (
    <CollectionPageClient
      initialCollection={data.collection}
      creator={data.creator}
      initialRevealedItems={data.revealedItems}
      viewerDid={session?.did ?? null}
      viewerUnlimitedPulls={data.viewerUnlimitedPulls}
      nextPullUtcIso={data.nextPullUtcIso}
    />
  );
}
