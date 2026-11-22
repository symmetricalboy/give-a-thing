import {
  and,
  asc,
  cosineDistance,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getDb, schema } from "@/db";
import { embedThingText } from "@/lib/generator/gemini";
import {
  getCurrentUtcDateString,
  getNextUtcMidnightIso,
  isUnlimitedPullAccount,
} from "@/lib/generator/pull-service";
import {
  buildBlueskyComposerIntentUrl,
  isOfferRevocableNow,
} from "@/lib/trading/trade-service";
import { getPublicAppUrl } from "@/lib/atproto/oauth";
import {
  fetchRichBlueskyProfile,
  searchBlueskyActors,
  type BlueskyProfileLink,
} from "@/lib/atproto/public-bsky";

export interface PublicUserBrief {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ProfileSocialUser extends PublicUserBrief {
  viewerFollows: boolean;
}

export interface DirectoryUserCard extends PublicUserBrief {
  isRegisteredPlayer: boolean;
  heldCount: number;
  discoveredCount: number;
  viewerFollows: boolean;
}

export type { BlueskyProfileLink };

export interface ThingCardItem {
  thingTid: string;
  catalogNumber: number;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  flavorText: string;
  uselessTrait: string;
  iconUrl: string;
  iconAlt: string;
  pullUtcDate: string;
  status: "held" | "escrowed";
  transferCount: number;
  favoriteSlot?: number | null;
  canonicalAtUri: string | null;
  currentHoldingAtUri: string | null;
  createdAtIso: string;
  discoverer: PublicUserBrief;
  currentOwner: PublicUserBrief;
}

export interface FeedItemDTO {
  id: number;
  eventType: "daily_pull" | "direct_gift" | "escrow_claim";
  sequenceNum: number;
  note: string | null;
  createdAtIso: string;
  actor: PublicUserBrief;
  target: PublicUserBrief | null;
  thing: {
    thingTid: string;
    catalogNumber: number;
    name: string;
    category: string;
    uselessTrait: string;
    iconUrl: string;
    iconAlt: string;
    transferCount: number;
  };
}

async function fetchUsersMap(
  dids: string[]
): Promise<Map<string, PublicUserBrief>> {
  const unique = Array.from(new Set(dids.filter(Boolean)));
  const map = new Map<string, PublicUserBrief>();
  if (unique.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      did: schema.users.did,
      handle: schema.users.handle,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.users)
    .where(inArray(schema.users.did, unique));

  for (const r of rows) {
    map.set(r.did, r);
  }
  return map;
}

function fallbackBrief(did: string): PublicUserBrief {
  return { did, handle: did, displayName: null, avatarUrl: null };
}

export async function getDailyPullStatus(
  viewerDid: string | null,
  viewerHandle?: string | null
) {
  const nextPullUtcIso = getNextUtcMidnightIso();
  const pullUtcDate = getCurrentUtcDateString();

  if (!viewerDid) {
    return {
      authenticated: false,
      hasPulledToday: false,
      unlimitedPulls: false,
      pullUtcDate,
      nextPullUtcIso,
      todaysThing: null,
    };
  }

  const db = getDb();
  const [userRows, todayRows] = await Promise.all([
    db
      .select({ did: schema.users.did, handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.did, viewerDid))
      .limit(1),
    db
      .select()
      .from(schema.things)
      .where(
        and(
          eq(schema.things.discovererDid, viewerDid),
          eq(schema.things.pullUtcDate, pullUtcDate)
        )
      )
      .orderBy(desc(schema.things.createdAt))
      .limit(1),
  ]);

  const unlimited = isUnlimitedPullAccount({
    did: viewerDid,
    handle: userRows[0]?.handle ?? viewerHandle ?? null,
  });

  const row = todayRows[0];
  if (!row) {
    return {
      authenticated: true,
      hasPulledToday: false,
      unlimitedPulls: unlimited,
      pullUtcDate,
      nextPullUtcIso,
      todaysThing: null,
    };
  }

  return {
    authenticated: true,
    hasPulledToday: !unlimited,
    unlimitedPulls: unlimited,
    pullUtcDate,
    nextPullUtcIso,
    todaysThing: {
      thingTid: row.thingTid,
      catalogNumber: row.catalogNumber,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      description: row.description,
      flavorText: row.flavorText,
      uselessTrait: row.uselessTrait,
      iconUrl: row.iconUrl,
      iconAlt: row.iconAlt,
      transferCount: row.transferCount,
    },
  };
}

export async function getFeedPage(params: {
  mode: "global" | "following";
  viewerDid?: string | null;
  cursorId?: number;
  limit?: number;
}): Promise<{ items: FeedItemDTO[]; nextCursor: number | null }> {
  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 50);

  let followedDids: string[] = [];
  if (params.mode === "following") {
    if (!params.viewerDid) {
      return { items: [], nextCursor: null };
    }
    const fRows = await db
      .select({ subjectDid: schema.follows.subjectDid })
      .from(schema.follows)
      .where(eq(schema.follows.followerDid, params.viewerDid));
    followedDids = [params.viewerDid, ...fRows.map((r) => r.subjectDid)];
  }

  const conditions = [];
  if (params.cursorId) {
    conditions.push(lt(schema.feedEvents.id, params.cursorId));
  }
  if (params.mode === "following") {
    conditions.push(
      or(
        inArray(schema.feedEvents.actorDid, followedDids),
        inArray(schema.feedEvents.targetDid, followedDids)
      )
    );
  }

  const eventRows = await db
    .select()
    .from(schema.feedEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.feedEvents.id))
    .limit(limit + 1);

  const hasMore = eventRows.length > limit;
  const pageRows = hasMore ? eventRows.slice(0, limit) : eventRows;
  if (pageRows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const thingTids = Array.from(new Set(pageRows.map((e) => e.thingTid)));
  const thingRows = await db
    .select({
      thingTid: schema.things.thingTid,
      catalogNumber: schema.things.catalogNumber,
      name: schema.things.name,
      category: schema.things.category,
      uselessTrait: schema.things.uselessTrait,
      iconUrl: schema.things.iconUrl,
      iconAlt: schema.things.iconAlt,
      transferCount: schema.things.transferCount,
    })
    .from(schema.things)
    .where(inArray(schema.things.thingTid, thingTids));

  const thingMap = new Map(thingRows.map((t) => [t.thingTid, t]));

  const userDids: string[] = [];
  for (const e of pageRows) {
    userDids.push(e.actorDid);
    if (e.targetDid) userDids.push(e.targetDid);
  }
  const userMap = await fetchUsersMap(userDids);

  const items: FeedItemDTO[] = [];
  for (const e of pageRows) {
    const t = thingMap.get(e.thingTid);
    if (!t) continue;
    items.push({
      id: e.id,
      eventType: e.eventType as "daily_pull" | "direct_gift" | "escrow_claim",
      sequenceNum: e.sequenceNum,
      note: e.note,
      createdAtIso: e.createdAt.toISOString(),
      actor: userMap.get(e.actorDid) ?? fallbackBrief(e.actorDid),
      target: e.targetDid
        ? userMap.get(e.targetDid) ?? fallbackBrief(e.targetDid)
        : null,
      thing: t,
    });
  }

  return {
    items,
    nextCursor: hasMore ? pageRows[pageRows.length - 1]!.id : null,
  };
}

export async function getThingDetailWithLedger(thingTid: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.thingTid, thingTid))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [ledgerRows, openOfferRows] = await Promise.all([
    db
      .select()
      .from(schema.provenanceEntries)
      .where(eq(schema.provenanceEntries.thingTid, thingTid))
      .orderBy(asc(schema.provenanceEntries.sequenceNum)),
    db
      .select()
      .from(schema.escrowOffers)
      .where(
        and(
          eq(schema.escrowOffers.thingTid, thingTid),
          eq(schema.escrowOffers.status, "open")
        )
      )
      .limit(1),
  ]);

  const dids = [
    row.discovererDid,
    row.currentOwnerDid,
    ...ledgerRows.map((l) => l.toDid),
    ...ledgerRows.map((l) => l.fromDid ?? ""),
  ];
  const userMap = await fetchUsersMap(dids);

  const openOffer = openOfferRows[0];
  const appUrl = getPublicAppUrl();

  return {
    thingTid: row.thingTid,
    catalogNumber: row.catalogNumber,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    flavorText: row.flavorText,
    uselessTrait: row.uselessTrait,
    iconUrl: row.iconUrl,
    iconAlt: row.iconAlt,
    pullUtcDate: row.pullUtcDate,
    status: row.status as "held" | "escrowed",
    transferCount: row.transferCount,
    canonicalAtUri: row.canonicalAtUri,
    latestLedgerAtUri: row.latestLedgerAtUri,
    currentHoldingAtUri: row.currentHoldingAtUri,
    createdAtIso: row.createdAt.toISOString(),
    discoverer:
      userMap.get(row.discovererDid) ?? fallbackBrief(row.discovererDid),
    currentOwner:
      userMap.get(row.currentOwnerDid) ?? fallbackBrief(row.currentOwnerDid),
    activeEscrow: openOffer
      ? {
          offerTid: openOffer.offerTid,
          recipientDid: openOffer.recipientDid,
          recipientHandle: openOffer.recipientHandleSnapshot,
          note: openOffer.note,
          createdAtIso: openOffer.createdAt.toISOString(),
          revocableAfterIso: openOffer.revocableAfter.toISOString(),
          isRevocableNow: isOfferRevocableNow(openOffer.revocableAfter),
          claimUrl: `${appUrl}/claim/${openOffer.offerTid}`,
          composerIntentUrl: buildBlueskyComposerIntentUrl({
            recipientHandle: openOffer.recipientHandleSnapshot,
            thingName: row.name,
            catalogNumber: row.catalogNumber,
            claimUrl: `${appUrl}/claim/${openOffer.offerTid}`,
            note: openOffer.note ?? undefined,
          }),
        }
      : null,
    provenance: ledgerRows.map((l) => ({
      id: l.id,
      entryTid: l.entryTid,
      sequenceNum: l.sequenceNum,
      via: l.via as "daily_pull" | "direct_gift" | "escrow_claim",
      note: l.note,
      occurredAtIso: l.occurredAt.toISOString(),
      ledgerAtUri: l.ledgerAtUri,
      userProofAtUri: l.userProofAtUri,
      fromUser: l.fromDid
        ? userMap.get(l.fromDid) ?? {
            did: l.fromDid,
            handle: l.fromHandleSnapshot ?? l.fromDid,
            displayName: null,
            avatarUrl: null,
          }
        : null,
      toUser: userMap.get(l.toDid) ?? {
        did: l.toDid,
        handle: l.toHandleSnapshot,
        displayName: null,
        avatarUrl: null,
      },
    })),
  };
}

export async function searchDiscoveryCatalog(params: {
  query?: string;
  semantic?: boolean;
  category?: string;
  sort?: "newest" | "oldest" | "hot_potato";
  page?: number;
  pageSize?: number;
}): Promise<{
  items: ThingCardItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}> {
  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 24, 1), 60);
  const offset = (page - 1) * pageSize;
  const q = params.query?.trim() ?? "";

  if (q && params.semantic && process.env.GEMINI_API_KEY) {
    const queryVec = await embedThingText(q);
    const simExpr = sql<number>`1 - (${cosineDistance(
      schema.things.embedding,
      queryVec
    )})`;

    const whereCond = params.category
      ? eq(schema.things.category, params.category)
      : undefined;

    const [rows, totalRes] = await Promise.all([
      db
        .select({
          thing: schema.things,
          similarity: simExpr,
        })
        .from(schema.things)
        .where(whereCond)
        .orderBy((t) => desc(t.similarity))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(schema.things).where(whereCond),
    ]);

    const thingRows = rows.map((r) => r.thing);
    const userMap = await fetchUsersMap(
      thingRows.flatMap((t) => [t.discovererDid, t.currentOwnerDid])
    );

    return {
      items: thingRows.map((r) => mapThingRowToCard(r, userMap)),
      totalCount: Number(totalRes[0]?.value ?? 0),
      page,
      pageSize,
    };
  }

  const conditions = [];
  if (params.category) {
    conditions.push(eq(schema.things.category, params.category));
  }
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(schema.things.name, pattern),
        ilike(schema.things.description, pattern),
        ilike(schema.things.subcategory, pattern),
        ilike(schema.things.flavorText, pattern)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orderByClause =
    params.sort === "oldest"
      ? asc(schema.things.catalogNumber)
      : params.sort === "hot_potato"
        ? [desc(schema.things.transferCount), desc(schema.things.catalogNumber)]
        : desc(schema.things.catalogNumber);

  const [thingRows, totalRes] = await Promise.all([
    db
      .select()
      .from(schema.things)
      .where(whereClause)
      .orderBy(
        ...(Array.isArray(orderByClause) ? orderByClause : [orderByClause])
      )
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(schema.things).where(whereClause),
  ]);

  const userMap = await fetchUsersMap(
    thingRows.flatMap((t) => [t.discovererDid, t.currentOwnerDid])
  );

  return {
    items: thingRows.map((r) => mapThingRowToCard(r, userMap)),
    totalCount: Number(totalRes[0]?.value ?? 0),
    page,
    pageSize,
  };
}

export async function searchDirectoryUsers(params: {
  query?: string;
  viewerDid?: string | null;
  limit?: number;
}): Promise<DirectoryUserCard[]> {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 50);
  const rawQuery = params.query?.trim() ?? "";
  const cleanQuery = rawQuery.replace(/^@/, "");

  let localUsers: Array<{
    did: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  }> = [];
  let viewerFollowSet = new Set<string>();
  let dbAvailable = true;

  try {
    const db = getDb();
    const pattern = `%${cleanQuery}%`;
    const [uRows, fRows] = await Promise.all([
      db
        .select({
          did: schema.users.did,
          handle: schema.users.handle,
          displayName: schema.users.displayName,
          avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(
          cleanQuery
            ? or(
                ilike(schema.users.handle, pattern),
                ilike(schema.users.displayName, pattern)
              )
            : undefined
        )
        .orderBy(desc(schema.users.createdAt))
        .limit(limit),
      params.viewerDid
        ? db
            .select({ subjectDid: schema.follows.subjectDid })
            .from(schema.follows)
            .where(eq(schema.follows.followerDid, params.viewerDid))
        : Promise.resolve([]),
    ]);
    localUsers = uRows;
    viewerFollowSet = new Set(fRows.map((f) => f.subjectDid));
  } catch {
    dbAvailable = false;
  }

  const remoteActors =
    cleanQuery.length >= 2 ? await searchBlueskyActors(cleanQuery, 16) : [];

  const mergedByDid = new Map<
    string,
    {
      did: string;
      handle: string;
      displayName: string | null;
      avatarUrl: string | null;
      isRegisteredPlayer: boolean;
    }
  >();

  for (const u of localUsers) {
    mergedByDid.set(u.did, {
      ...u,
      isRegisteredPlayer: true,
    });
  }

  if (dbAvailable && remoteActors.length > 0) {
    try {
      const db = getDb();
      const remoteDids = remoteActors.map((a) => a.did);
      const registeredRemote = await db
        .select({ did: schema.users.did })
        .from(schema.users)
        .where(inArray(schema.users.did, remoteDids));
      const regSet = new Set(registeredRemote.map((r) => r.did));

      for (const a of remoteActors) {
        const existing = mergedByDid.get(a.did);
        if (existing) {
          mergedByDid.set(a.did, {
            did: a.did,
            handle: a.handle || existing.handle,
            displayName: a.displayName ?? existing.displayName,
            avatarUrl: a.avatar ?? existing.avatarUrl,
            isRegisteredPlayer: true,
          });
        } else {
          mergedByDid.set(a.did, {
            did: a.did,
            handle: a.handle,
            displayName: a.displayName ?? null,
            avatarUrl: a.avatar ?? null,
            isRegisteredPlayer: regSet.has(a.did),
          });
        }
      }
    } catch {
      for (const a of remoteActors) {
        if (!mergedByDid.has(a.did)) {
          mergedByDid.set(a.did, {
            did: a.did,
            handle: a.handle,
            displayName: a.displayName ?? null,
            avatarUrl: a.avatar ?? null,
            isRegisteredPlayer: false,
          });
        }
      }
    }
  } else {
    for (const a of remoteActors) {
      if (!mergedByDid.has(a.did)) {
        mergedByDid.set(a.did, {
          did: a.did,
          handle: a.handle,
          displayName: a.displayName ?? null,
          avatarUrl: a.avatar ?? null,
          isRegisteredPlayer: false,
        });
      }
    }
  }

  const allEntries = Array.from(mergedByDid.values()).slice(0, limit);
  const playerDids = allEntries
    .filter((u) => u.isRegisteredPlayer)
    .map((u) => u.did);

  const heldMap = new Map<string, number>();
  const discoveredMap = new Map<string, number>();

  if (dbAvailable && playerDids.length > 0) {
    try {
      const db = getDb();
      const [heldCounts, discCounts] = await Promise.all([
        db
          .select({
            did: schema.things.currentOwnerDid,
            value: count(),
          })
          .from(schema.things)
          .where(inArray(schema.things.currentOwnerDid, playerDids))
          .groupBy(schema.things.currentOwnerDid),
        db
          .select({
            did: schema.things.discovererDid,
            value: count(),
          })
          .from(schema.things)
          .where(inArray(schema.things.discovererDid, playerDids))
          .groupBy(schema.things.discovererDid),
      ]);

      for (const r of heldCounts) heldMap.set(r.did, Number(r.value));
      for (const r of discCounts) discoveredMap.set(r.did, Number(r.value));
    } catch {
      // Keep zero counts on offline fallback
    }
  }

  return allEntries
    .map((u) => ({
      did: u.did,
      handle: u.handle,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isRegisteredPlayer: u.isRegisteredPlayer,
      heldCount: heldMap.get(u.did) ?? 0,
      discoveredCount: discoveredMap.get(u.did) ?? 0,
      viewerFollows: viewerFollowSet.has(u.did),
    }))
    .sort((a, b) => {
      if (a.isRegisteredPlayer !== b.isRegisteredPlayer) {
        return a.isRegisteredPlayer ? -1 : 1;
      }
      if (b.heldCount !== a.heldCount) {
        return b.heldCount - a.heldCount;
      }
      return a.handle.localeCompare(b.handle);
    });
}

function mapThingRowToCard(
  r: typeof schema.things.$inferSelect,
  userMap: Map<string, PublicUserBrief>,
  favoriteSlot: number | null = null
): ThingCardItem {
  return {
    thingTid: r.thingTid,
    catalogNumber: r.catalogNumber,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    description: r.description,
    flavorText: r.flavorText,
    uselessTrait: r.uselessTrait,
    iconUrl: r.iconUrl,
    iconAlt: r.iconAlt,
    pullUtcDate: r.pullUtcDate,
    status: r.status as "held" | "escrowed",
    transferCount: r.transferCount,
    favoriteSlot,
    canonicalAtUri: r.canonicalAtUri,
    currentHoldingAtUri: r.currentHoldingAtUri,
    createdAtIso: r.createdAt.toISOString(),
    discoverer:
      userMap.get(r.discovererDid) ?? fallbackBrief(r.discovererDid),
    currentOwner:
      userMap.get(r.currentOwnerDid) ?? fallbackBrief(r.currentOwnerDid),
  };
}

export async function getPlayerProfile(
  handleOrDid: string,
  viewerDid?: string | null
) {
  const db = getDb();
  const decoded = decodeURIComponent(handleOrDid).replace(/^@/, "");

  const userRows = await db
    .select()
    .from(schema.users)
    .where(
      decoded.startsWith("did:")
        ? eq(schema.users.did, decoded)
        : eq(schema.users.handle, decoded)
    )
    .limit(1);

  const player = userRows[0];
  if (!player) return null;

  const [
    heldRows,
    favoriteRows,
    discoveredCountRes,
    givenCountRes,
    openEscrowRows,
    playerFollowingRows,
    playerFollowerRows,
    viewerFollowingRows,
    bskyProfile,
  ] = await Promise.all([
    db
      .select()
      .from(schema.things)
      .where(eq(schema.things.currentOwnerDid, player.did))
      .orderBy(desc(schema.things.createdAt)),
    db
      .select()
      .from(schema.userFavoriteThings)
      .where(eq(schema.userFavoriteThings.userDid, player.did))
      .orderBy(asc(schema.userFavoriteThings.slot)),
    db
      .select({ value: count() })
      .from(schema.things)
      .where(eq(schema.things.discovererDid, player.did)),
    db
      .select({ value: count() })
      .from(schema.provenanceEntries)
      .where(eq(schema.provenanceEntries.fromDid, player.did)),
    db
      .select()
      .from(schema.escrowOffers)
      .where(
        and(
          eq(schema.escrowOffers.senderDid, player.did),
          eq(schema.escrowOffers.status, "open")
        )
      )
      .orderBy(desc(schema.escrowOffers.createdAt)),
    db
      .select({ subjectDid: schema.follows.subjectDid })
      .from(schema.follows)
      .where(eq(schema.follows.followerDid, player.did))
      .orderBy(desc(schema.follows.createdAt)),
    db
      .select({ followerDid: schema.follows.followerDid })
      .from(schema.follows)
      .where(eq(schema.follows.subjectDid, player.did))
      .orderBy(desc(schema.follows.createdAt)),
    viewerDid
      ? db
          .select({ subjectDid: schema.follows.subjectDid })
          .from(schema.follows)
          .where(eq(schema.follows.followerDid, viewerDid))
      : Promise.resolve([]),
    fetchRichBlueskyProfile(player.did),
  ]);

  const followingDids = playerFollowingRows.map((r) => r.subjectDid);
  const followerDids = playerFollowerRows.map((r) => r.followerDid);
  const viewerFollowSet = new Set(viewerFollowingRows.map((r) => r.subjectDid));

  const userMap = await fetchUsersMap([
    player.did,
    ...heldRows.map((t) => t.discovererDid),
    ...followingDids,
    ...followerDids,
  ]);

  const followingList: ProfileSocialUser[] = followingDids.map((did) => ({
    ...(userMap.get(did) ?? fallbackBrief(did)),
    viewerFollows: viewerFollowSet.has(did),
  }));

  const followersList: ProfileSocialUser[] = followerDids.map((did) => ({
    ...(userMap.get(did) ?? fallbackBrief(did)),
    viewerFollows: viewerFollowSet.has(did),
  }));

  const appUrl = getPublicAppUrl();
  const heldByTid = new Map(heldRows.map((h) => [h.thingTid, h]));
  const favSlotByTid = new Map(favoriteRows.map((f) => [f.thingTid, f.slot]));

  const inventory = heldRows.map((r) =>
    mapThingRowToCard(r, userMap, favSlotByTid.get(r.thingTid) ?? null)
  );

  const topThings = favoriteRows
    .slice(0, 8)
    .map((f) => {
      const row = heldByTid.get(f.thingTid);
      if (!row) return null;
      return {
        ...mapThingRowToCard(row, userMap, f.slot),
        favoriteSlot: f.slot,
      };
    })
    .filter((x): x is ThingCardItem & { favoriteSlot: number } => Boolean(x));

  const effectiveHandle = bskyProfile?.handle ?? player.handle;

  return {
    player: {
      did: player.did,
      handle: effectiveHandle,
      displayName: bskyProfile?.displayName ?? player.displayName,
      avatarUrl: bskyProfile?.avatar ?? player.avatarUrl,
      bannerUrl: bskyProfile?.banner ?? null,
      pronouns: bskyProfile?.pronouns ?? null,
      bio: bskyProfile?.bio ?? null,
      links: bskyProfile?.links ?? [],
      bskyProfileUrl:
        bskyProfile?.bskyProfileUrl ??
        `https://bsky.app/profile/${encodeURIComponent(effectiveHandle)}`,
      createdAtIso: player.createdAt.toISOString(),
    },
    stats: {
      heldCount: heldRows.length,
      discoveredCount: Number(discoveredCountRes[0]?.value ?? 0),
      givenAwayCount: Number(givenCountRes[0]?.value ?? 0),
      followingCount: followingList.length,
      followersCount: followersList.length,
    },
    isFollowing: viewerFollowSet.has(player.did),
    followingList,
    followersList,
    topThings,
    inventory,
    outgoingEscrows: openEscrowRows.map((o) => {
      const t = heldByTid.get(o.thingTid);
      const claimUrl = `${appUrl}/claim/${o.offerTid}`;
      return {
        offerTid: o.offerTid,
        thingTid: o.thingTid,
        thingName: t?.name ?? "Mystery Thing",
        catalogNumber: t?.catalogNumber ?? 0,
        iconUrl: t?.iconUrl ?? `/api/sprites/${o.thingTid}`,
        recipientDid: o.recipientDid,
        recipientHandle: o.recipientHandleSnapshot,
        note: o.note,
        createdAtIso: o.createdAt.toISOString(),
        revocableAfterIso: o.revocableAfter.toISOString(),
        isRevocableNow: isOfferRevocableNow(o.revocableAfter),
        claimUrl,
        composerIntentUrl: buildBlueskyComposerIntentUrl({
          recipientHandle: o.recipientHandleSnapshot,
          thingName: t?.name ?? "a thing",
          catalogNumber: t?.catalogNumber ?? 1,
          claimUrl,
          note: o.note ?? undefined,
        }),
      };
    }),
  };
}

export async function getEscrowOfferPageData(offerTid: string) {
  const db = getDb();
  const [offer] = await db
    .select()
    .from(schema.escrowOffers)
    .where(eq(schema.escrowOffers.offerTid, offerTid))
    .limit(1);

  if (!offer) return null;

  const [thingRow, senderRows] = await Promise.all([
    db
      .select()
      .from(schema.things)
      .where(eq(schema.things.thingTid, offer.thingTid))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, offer.senderDid))
      .limit(1),
  ]);

  if (!thingRow) return null;
  const sender = senderRows[0] ?? fallbackBrief(offer.senderDid);

  return {
    offerTid: offer.offerTid,
    status: offer.status as "open" | "claimed" | "revoked",
    recipientDid: offer.recipientDid,
    recipientHandle: offer.recipientHandleSnapshot,
    recipientDisplayName: offer.recipientDisplayName,
    recipientAvatarUrl: offer.recipientAvatarUrl,
    note: offer.note,
    createdAtIso: offer.createdAt.toISOString(),
    revocableAfterIso: offer.revocableAfter.toISOString(),
    isRevocableNow: isOfferRevocableNow(offer.revocableAfter),
    sender: {
      did: sender.did,
      handle: sender.handle,
      displayName: sender.displayName,
      avatarUrl: sender.avatarUrl,
    },
    thing: {
      thingTid: thingRow.thingTid,
      catalogNumber: thingRow.catalogNumber,
      name: thingRow.name,
      category: thingRow.category,
      subcategory: thingRow.subcategory,
      description: thingRow.description,
      flavorText: thingRow.flavorText,
      uselessTrait: thingRow.uselessTrait,
      iconUrl: thingRow.iconUrl,
      iconAlt: thingRow.iconAlt,
      spritePngBase64: thingRow.spritePngBase64,
    },
  };
}
