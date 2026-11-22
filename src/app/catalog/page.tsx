import React from "react";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/session";
import { searchDiscoveryCatalog, type ThingCardItem } from "@/lib/queries";
import { CatalogBrowser } from "@/components/CatalogBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discovery Catalog",
  description:
    "Browse every unique pointless 16-bit Thing ever discovered on Give a Thing.",
};

export default async function CatalogPage() {
  const session = await getCurrentSession();

  let items: ThingCardItem[] = [];
  let totalCount = 0;

  try {
    const res = await searchDiscoveryCatalog({
      sort: "newest",
      page: 1,
      pageSize: 24,
    });
    items = res.items;
    totalCount = res.totalCount;
  } catch {
    // Graceful empty state when DB is not yet migrated locally
  }

  return (
    <CatalogBrowser
      initialItems={items}
      initialTotalCount={totalCount}
      viewerDid={session?.did ?? null}
    />
  );
}
