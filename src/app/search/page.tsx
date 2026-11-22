import React from "react";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/session";
import {
  searchDirectoryUsers,
  searchDiscoveryCatalog,
  type DirectoryUserCard,
  type ThingCardItem,
} from "@/lib/queries";
import { CatalogBrowser } from "@/components/CatalogBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find Things",
  description:
    "Search every unique pointless 16-bit thing ever unwrapped and look up players on Give a Thing.",
};

export default async function FindThingsPage() {
  const session = await getCurrentSession();

  let items: ThingCardItem[] = [];
  let totalCount = 0;
  let initialUsers: DirectoryUserCard[] = [];

  try {
    const [thingRes, usersRes] = await Promise.all([
      searchDiscoveryCatalog({
        sort: "newest",
        page: 1,
        pageSize: 24,
      }),
      searchDirectoryUsers({
        viewerDid: session?.did ?? null,
        limit: 24,
      }),
    ]);
    items = thingRes.items;
    totalCount = thingRes.totalCount;
    initialUsers = usersRes;
  } catch {
    // Graceful empty state when DB is not yet migrated locally
  }

  return (
    <CatalogBrowser
      initialItems={items}
      initialTotalCount={totalCount}
      initialUsers={initialUsers}
      viewerDid={session?.did ?? null}
    />
  );
}
