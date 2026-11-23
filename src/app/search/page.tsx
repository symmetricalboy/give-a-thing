import React from "react";
import type { Metadata } from "next";
import { getCurrentSession } from "@/lib/session";
import {
  searchDirectoryCollections,
  searchDirectoryUsers,
  searchDiscoveryCatalog,
  type DirectoryCollectionCard,
  type DirectoryUserCard,
  type ThingCardItem,
} from "@/lib/queries";
import { CatalogBrowser } from "@/components/CatalogBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find Things",
  description:
    "Search every unique pointless 16-bit thing, Mystery Box collection, and player on Give a Thing.",
};

export default async function FindThingsPage() {
  const session = await getCurrentSession();

  let items: ThingCardItem[] = [];
  let totalCount = 0;
  let initialCollections: DirectoryCollectionCard[] = [];
  let initialTotalCollectionsCount = 0;
  let initialUsers: DirectoryUserCard[] = [];
  let initialTotalUsersCount = 0;

  try {
    const [thingRes, collectionsRes, usersRes] = await Promise.all([
      searchDiscoveryCatalog({
        page: 1,
        pageSize: 24,
      }),
      searchDirectoryCollections({
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
    initialCollections = collectionsRes.collections;
    initialTotalCollectionsCount = collectionsRes.totalCount;
    initialUsers = usersRes.users;
    initialTotalUsersCount = usersRes.totalCount;
  } catch {
    // Graceful empty state when DB is not yet migrated locally
  }

  return (
    <CatalogBrowser
      initialItems={items}
      initialTotalCount={totalCount}
      initialCollections={initialCollections}
      initialTotalCollectionsCount={initialTotalCollectionsCount}
      initialUsers={initialUsers}
      initialTotalUsersCount={initialTotalUsersCount}
      viewerDid={session?.did ?? null}
    />
  );
}
