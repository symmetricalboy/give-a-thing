import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { nextTid, type ProvenanceHop, type StrongRef } from "@/lib/lexicons";
import {
  getAppPdsAgent,
  mintCanonicalThingOnAppPds,
} from "@/lib/atproto/app-pds";
import { putUserHoldingOnPds } from "@/lib/atproto/user-pds";
import { storeSpriteAssets } from "@/lib/storage";
import { broadcastFeedEvent } from "@/lib/feed/bus";
import { sampleCategorySeed } from "./categories";
import {
  checkCatalogCollision,
  computeCanonicalFingerprint,
  findOverusedWords,
  type CollisionMatch,
} from "./dedup";
import {
  embedThingText,
  generate16BitSpritePng,
  generateThingConceptWithCarbon,
  type GeneratedThingConcept,
} from "./gemini";
import { processInto16BitSprite } from "./pixel-art";

export const UNLIMITED_PULL_HANDLE = "giveathing.com";
export const DAILY_PULL_CACHE_TARGET = 10;

export function isUnlimitedPullAccount(account: {
  did?: string | null;
  handle?: string | null;
}): boolean {
  const cleanHandle = account.handle?.trim().toLowerCase().replace(/^@/, "");
  if (cleanHandle === UNLIMITED_PULL_HANDLE) {
    return true;
  }
  const appDid = process.env.NEXT_PUBLIC_APP_ATPROTO_DID?.trim();
  if (
    appDid &&
    !appDid.includes("replace_with") &&
    account.did &&
    account.did === appDid
  ) {
    return true;
  }
  return false;
}

export function getCurrentUtcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getNextUtcMidnightIso(now: Date = new Date()): string {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
  return next.toISOString();
}

/**
 * Returns the smallest positive integer (>= 1) not present in `existingNumbers`.
 * Ensures any skipped/missing catalog numbers (such as #0011) are filled before
 * advancing past the maximum catalog number.
 */
export function findLowestMissingCatalogNumber(
  existingNumbers: Iterable<number>
): number {
  const seen = new Set<number>();
  for (const n of existingNumbers) {
    if (Number.isInteger(n) && n >= 1) {
      seen.add(n);
    }
  }
  let candidate = 1;
  while (seen.has(candidate)) {
    candidate++;
  }
  return candidate;
}

/**
 * Returns all missing positive catalog numbers strictly below `max(existingNumbers)`.
 * For example, `[1..10, 12..19]` yields `[11]`.
 */
export function findInteriorMissingCatalogNumbers(
  existingNumbers: Iterable<number>
): number[] {
  const seen = new Set<number>();
  let max = 0;
  for (const n of existingNumbers) {
    if (Number.isInteger(n) && n >= 1) {
      seen.add(n);
      if (n > max) max = n;
    }
  }
  const missing: number[] = [];
  for (let i = 1; i < max; i++) {
    if (!seen.has(i)) {
      missing.push(i);
    }
  }
  return missing;
}

export class DailyPullAlreadyUsedError extends Error {
  public readonly thingTid: string;
  constructor(thingTid: string) {
    super("You already got your thing for today! Come back at 00:00 UTC.");
    this.name = "DailyPullAlreadyUsedError";
    this.thingTid = thingTid;
  }
}

export class DailyPullInProgressError extends Error {
  constructor() {
    super("Your thing is currently being conjured—hang tight for a few seconds!");
    this.name = "DailyPullInProgressError";
  }
}

export interface PullResultPayload {
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
  canonicalAtUri: string | null;
  holdingAtUri: string | null;
  nextPullUtcIso: string;
  unlimitedPulls: boolean;
}

interface PreparedDailyThingAssets {
  subcategoryKey: string;
  category: string;
  subcategory: string;
  name: string;
  canonicalFingerprint: string;
  description: string;
  flavorText: string;
  uselessTrait: string;
  iconAlt: string;
  embedding: number[];
  sprite64Png: Buffer;
  sprite512Png: Buffer;
}

/**
 * Generates a brand-new, zero-duplicate 16-bit Thing (concept + semantic embedding +
 * processed 64x64 and 512x512 transparent PNG sprites), checking both revealed `things`
 * and unrevealed `daily_pull_cache` items for collisions and vocabulary variety.
 */
async function generateFreshDailyPullItemAssets(): Promise<PreparedDailyThingAssets> {
  const db = getDb();

  const [statRows, cachedSubcatRows] = await Promise.all([
    db.select().from(schema.subcategoryStats),
    db
      .select({
        subcategoryKey: schema.dailyPullCache.subcategoryKey,
        value: count(),
      })
      .from(schema.dailyPullCache)
      .groupBy(schema.dailyPullCache.subcategoryKey),
  ]);

  const usageMap = new Map<string, number>();
  for (const s of statRows) {
    usageMap.set(s.subcategoryKey, s.pullCount);
  }
  for (const c of cachedSubcatRows) {
    usageMap.set(
      c.subcategoryKey,
      (usageMap.get(c.subcategoryKey) ?? 0) + Number(c.value)
    );
  }
  const seed = sampleCategorySeed(usageMap);

  const [sameCatRows, sameCatCachedRows, recentGlobalRows, recentCachedRows] =
    await Promise.all([
      db
        .select({ name: schema.things.name })
        .from(schema.things)
        .where(eq(schema.things.category, seed.macroLabel))
        .orderBy(desc(schema.things.createdAt))
        .limit(50),
      db
        .select({ name: schema.dailyPullCache.name })
        .from(schema.dailyPullCache)
        .where(eq(schema.dailyPullCache.category, seed.macroLabel))
        .orderBy(desc(schema.dailyPullCache.createdAt))
        .limit(20),
      db
        .select({ name: schema.things.name })
        .from(schema.things)
        .orderBy(desc(schema.things.createdAt))
        .limit(80),
      db
        .select({ name: schema.dailyPullCache.name })
        .from(schema.dailyPullCache)
        .orderBy(desc(schema.dailyPullCache.createdAt))
        .limit(20),
    ]);

  const existingInSubcategory = [
    ...sameCatCachedRows.map((r) => r.name),
    ...sameCatRows.map((r) => r.name),
  ];
  const overusedWords = findOverusedWords([
    ...recentCachedRows.map((r) => r.name),
    ...recentGlobalRows.map((r) => r.name),
  ]);

  let chosenConcept: GeneratedThingConcept | null = null;
  let chosenEmbedding: number[] | null = null;
  let chosenFingerprint = "";
  let prevInteractionId: string | undefined;
  let lastCollision: CollisionMatch | undefined;

  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const turn = await generateThingConceptWithCarbon({
      seed,
      existingInSubcategory,
      overusedWords,
      previousInteractionId: prevInteractionId,
      collision: lastCollision,
    });

    prevInteractionId = turn.interactionId || undefined;
    const embText = `${turn.concept.name} — ${seed.macroLabel} (${seed.subcategory}): ${turn.concept.description} | Visual: ${turn.concept.pixelArtBrief}`;
    const embedding = await embedThingText(embText);

    const collision = await checkCatalogCollision(
      db,
      turn.concept.name,
      embedding
    );

    if (!collision) {
      chosenConcept = turn.concept;
      chosenEmbedding = embedding;
      chosenFingerprint = computeCanonicalFingerprint(turn.concept.name);
      break;
    }

    console.warn(
      `[daily-pull] Attempt ${attempt} collided with #${collision.catalogNumber} (${collision.name}, sim=${collision.similarity.toFixed(3)}). Retrying...`
    );
    lastCollision = collision;
  }

  if (!chosenConcept || !chosenEmbedding) {
    throw new Error(
      "The Thing Vault rolled four near-duplicates in a row—please click pull once more!"
    );
  }

  const rawPng = await generate16BitSpritePng(chosenConcept);
  const { sprite64Png, sprite512Png } = await processInto16BitSprite(rawPng);

  return {
    subcategoryKey: seed.subcategoryKey,
    category: seed.macroLabel,
    subcategory: seed.subcategory,
    name: chosenConcept.name,
    canonicalFingerprint: chosenFingerprint,
    description: chosenConcept.description,
    flavorText: chosenConcept.flavorText,
    uselessTrait: chosenConcept.uselessTrait,
    iconAlt: chosenConcept.iconAlt,
    embedding: chosenEmbedding,
    sprite64Png,
    sprite512Png,
  };
}

let cacheReplenishInFlight = false;
let cacheReplenishPending = false;

/**
 * Background worker that keeps `daily_pull_cache` stocked up to `DAILY_PULL_CACHE_TARGET` (10)
 * unrevealed Daily Pull items so players get instant draws without waiting on generation.
 */
export async function replenishDailyPullCache(
  targetCount: number = DAILY_PULL_CACHE_TARGET
): Promise<number> {
  if (!process.env.DATABASE_URL || !process.env.GEMINI_API_KEY?.trim()) {
    return 0;
  }
  if (process.env.GEMINI_API_KEY.includes("your-gemini-api-key")) {
    return 0;
  }

  if (cacheReplenishInFlight) {
    cacheReplenishPending = true;
    return 0;
  }

  cacheReplenishInFlight = true;
  cacheReplenishPending = false;
  const CACHE_LOCK_DID = "__daily_pull_cache__";
  const CACHE_LOCK_DATE = "global";
  let acquiredDbLock = false;
  let generatedCount = 0;

  try {
    const db = getDb();
    const [initialCountRow] = await db
      .select({ value: count() })
      .from(schema.dailyPullCache);
    if (Number(initialCountRow?.value ?? 0) >= targetCount) {
      return 0;
    }

    const [existingLease] = await db
      .select()
      .from(schema.dailyPullLocks)
      .where(
        and(
          eq(schema.dailyPullLocks.did, CACHE_LOCK_DID),
          eq(schema.dailyPullLocks.pullUtcDate, CACHE_LOCK_DATE)
        )
      )
      .limit(1);

    if (
      existingLease &&
      existingLease.status === "in_progress" &&
      Date.now() - existingLease.lockedAt.getTime() < 120_000
    ) {
      return 0;
    }

    await db
      .insert(schema.dailyPullLocks)
      .values({
        did: CACHE_LOCK_DID,
        pullUtcDate: CACHE_LOCK_DATE,
        status: "in_progress",
        lockedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.dailyPullLocks.did,
          schema.dailyPullLocks.pullUtcDate,
        ],
        set: { status: "in_progress", lockedAt: new Date() },
      });
    acquiredDbLock = true;

    while (true) {
      const [countRow] = await db
        .select({ value: count() })
        .from(schema.dailyPullCache);
      const currentCount = Number(countRow?.value ?? 0);
      if (currentCount >= targetCount) {
        break;
      }

      // Refresh cross-process lease before each generation
      await db
        .update(schema.dailyPullLocks)
        .set({ lockedAt: new Date(), status: "in_progress" })
        .where(
          and(
            eq(schema.dailyPullLocks.did, CACHE_LOCK_DID),
            eq(schema.dailyPullLocks.pullUtcDate, CACHE_LOCK_DATE)
          )
        );

      const prepared = await generateFreshDailyPullItemAssets();
      const cacheTid = nextTid();

      const inserted = await db
        .insert(schema.dailyPullCache)
        .values({
          cacheTid,
          name: prepared.name,
          canonicalFingerprint: prepared.canonicalFingerprint,
          subcategoryKey: prepared.subcategoryKey,
          category: prepared.category,
          subcategory: prepared.subcategory,
          description: prepared.description,
          flavorText: prepared.flavorText,
          uselessTrait: prepared.uselessTrait,
          iconAlt: prepared.iconAlt,
          embedding: prepared.embedding,
          sprite64PngBase64: prepared.sprite64Png.toString("base64"),
          sprite512PngBase64: prepared.sprite512Png.toString("base64"),
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ cacheTid: schema.dailyPullCache.cacheTid });

      if (inserted[0]) {
        generatedCount++;
        console.log(
          `[daily-pull-cache] Stocked unrevealed item (${currentCount + 1}/${targetCount}): ${prepared.name}`
        );
      }
    }

    return generatedCount;
  } finally {
    if (acquiredDbLock) {
      try {
        const db = getDb();
        await db
          .delete(schema.dailyPullLocks)
          .where(
            and(
              eq(schema.dailyPullLocks.did, CACHE_LOCK_DID),
              eq(schema.dailyPullLocks.pullUtcDate, CACHE_LOCK_DATE)
            )
          );
      } catch {
        // Ignore lease cleanup error
      }
    }

    cacheReplenishInFlight = false;
    if (cacheReplenishPending) {
      cacheReplenishPending = false;
      void replenishDailyPullCache(targetCount).catch((err) => {
        console.warn("[daily-pull-cache] Follow-up refill warning:", err);
      });
    }
  }
}

/**
 * Executes a player's once-per-UTC-day pull (or unlimited pulls when signed in as `@giveathing.com`):
 * 1. Acquires an atomic `(did, pull_utc_date)` in-progress lock in PostgreSQL.
 * 2. Atomically pops 1 pre-generated unrevealed item from `daily_pull_cache` (falling back seamlessly
 *    to live generation only if all 10 cached items were exhausted simultaneously).
 * 3. Allocates the next contiguous `catalog_number` and inserts into `things`.
 * 4. Mints immutable `com.giveathing.thing` & `com.giveathing.ledger` on `@giveathing.com`'s PDS,
 *    writes `com.giveathing.holding` to the discoverer's own PDS, and kicks off background cache refill!
 */
export async function executeDailyPull(
  userDid: string,
  options?: { bypassLock?: boolean; skipCache?: boolean }
): Promise<PullResultPayload> {
  const db = getDb();
  const pullUtcDate = getCurrentUtcDateString();
  const bypassLock = Boolean(options?.bypassLock);
  const skipCache = Boolean(options?.skipCache);

  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, userDid))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    throw new Error("Player account not found. Please sign in again.");
  }

  const unlimited = isUnlimitedPullAccount(user);

  if (!unlimited) {
    const existingToday = await db
      .select()
      .from(schema.things)
      .where(
        and(
          eq(schema.things.discovererDid, userDid),
          eq(schema.things.pullUtcDate, pullUtcDate),
          isNull(schema.things.collectionId)
        )
      )
      .limit(1);

    if (existingToday[0]) {
      throw new DailyPullAlreadyUsedError(existingToday[0].thingTid);
    }
  }

  // Acquire concurrency lock so double-clicks don't trigger parallel Gemini calls
  if (!bypassLock) {
    const existingLock = await db
      .select()
      .from(schema.dailyPullLocks)
      .where(
        and(
          eq(schema.dailyPullLocks.did, userDid),
          eq(schema.dailyPullLocks.pullUtcDate, pullUtcDate)
        )
      )
      .limit(1);

    if (existingLock[0]) {
      if (
        !unlimited &&
        existingLock[0].status === "completed" &&
        existingLock[0].thingTid
      ) {
        throw new DailyPullAlreadyUsedError(existingLock[0].thingTid);
      }
      if (existingLock[0].status === "in_progress") {
        const ageMs = Date.now() - existingLock[0].lockedAt.getTime();
        if (ageMs < 90_000) {
          throw new DailyPullInProgressError();
        }
      }
      await db
        .update(schema.dailyPullLocks)
        .set({ lockedAt: new Date(), status: "in_progress" })
        .where(
          and(
            eq(schema.dailyPullLocks.did, userDid),
            eq(schema.dailyPullLocks.pullUtcDate, pullUtcDate)
          )
        );
    } else {
      await db.insert(schema.dailyPullLocks).values({
        did: userDid,
        pullUtcDate,
        status: "in_progress",
        lockedAt: new Date(),
      });
    }
  }

  try {
    const thingTid = nextTid();
    const entryTid = nextTid();
    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();

    // Fast path: atomically pop 1 pre-generated unrevealed item from `daily_pull_cache`
    // and insert into `things` in a single advisory-locked transaction!
    let claimedFromCache: {
      inserted: typeof schema.things.$inferSelect;
      prepared: PreparedDailyThingAssets;
    } | null = null;

    if (!skipCache) {
      claimedFromCache = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(717341101)`);

        // Evict any stale cached items whose canonical fingerprint was taken meanwhile
        await tx.execute(sql`
          DELETE FROM daily_pull_cache c
          USING things t
          WHERE t.canonical_fingerprint = c.canonical_fingerprint
        `);

        const lockedRows = await tx.execute<{ cache_tid: string }>(sql`
          SELECT cache_tid
          FROM daily_pull_cache
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `);
        const pickedCacheTid = lockedRows[0]?.cache_tid;
        if (!pickedCacheTid) {
          return null;
        }

        const [popped] = await tx
          .delete(schema.dailyPullCache)
          .where(eq(schema.dailyPullCache.cacheTid, pickedCacheTid))
          .returning();

        if (!popped) {
          return null;
        }

        const existingNumbers = await tx
          .select({ catalogNumber: schema.things.catalogNumber })
          .from(schema.things);
        const assignedCatalogNumber = findLowestMissingCatalogNumber(
          existingNumbers.map((r) => r.catalogNumber)
        );

        let pullSlot = 1;
        if (unlimited) {
          const slotRows = await tx
            .select({
              maxSlot: sql<number>`COALESCE(MAX(${schema.things.pullSlot}), 0)`,
            })
            .from(schema.things)
            .where(
              and(
                eq(schema.things.discovererDid, userDid),
                eq(schema.things.pullUtcDate, pullUtcDate)
              )
            );
          pullSlot = Number(slotRows[0]?.maxSlot ?? 0) + 1;
        }

        const [officialCreator] = await tx
          .select({ did: schema.users.did })
          .from(schema.users)
          .where(sql`lower(${schema.users.handle}) = ${UNLIMITED_PULL_HANDLE}`)
          .limit(1);
        const generatedCreatorDid = officialCreator?.did ?? userDid;

        const [insertedRow] = await tx
          .insert(schema.things)
          .values({
            thingTid,
            catalogNumber: assignedCatalogNumber,
            name: popped.name,
            canonicalFingerprint: popped.canonicalFingerprint,
            category: popped.category,
            subcategory: popped.subcategory,
            description: popped.description,
            flavorText: popped.flavorText,
            uselessTrait: popped.uselessTrait,
            iconAlt: popped.iconAlt,
            embedding: popped.embedding,
            iconUrl: `/api/sprites/${thingTid}`,
            spritePngBase64: popped.sprite64PngBase64,
            createdByDid: generatedCreatorDid,
            collectionId: null,
            discovererDid: userDid,
            pullUtcDate,
            pullSlot,
            currentOwnerDid: userDid,
            status: "held",
            transferCount: 0,
            createdAt,
          })
          .returning();

        await tx.execute(sql`
          SELECT setval(
            pg_get_serial_sequence('things', 'catalog_number'),
            GREATEST(COALESCE((SELECT MAX(catalog_number) FROM things), 1), 1),
            true
          )
        `);

        return {
          inserted: insertedRow!,
          prepared: {
            subcategoryKey: popped.subcategoryKey,
            category: popped.category,
            subcategory: popped.subcategory,
            name: popped.name,
            canonicalFingerprint: popped.canonicalFingerprint,
            description: popped.description,
            flavorText: popped.flavorText,
            uselessTrait: popped.uselessTrait,
            iconAlt: popped.iconAlt,
            embedding: popped.embedding,
            sprite64Png: Buffer.from(popped.sprite64PngBase64, "base64"),
            sprite512Png: Buffer.from(popped.sprite512PngBase64, "base64"),
          },
        };
      });
    }

    let inserted: typeof schema.things.$inferSelect;
    let prepared: PreparedDailyThingAssets;

    if (claimedFromCache) {
      inserted = claimedFromCache.inserted;
      prepared = claimedFromCache.prepared;
      console.log(
        `[daily-pull] Instant cache hit! Popped "${prepared.name}" -> #${String(inserted.catalogNumber).padStart(4, "0")}`
      );
    } else {
      // Fallback path if cache was temporarily empty or skipped (e.g. catalog gap healing)
      prepared = await generateFreshDailyPullItemAssets();
      const spritePngBase64 = prepared.sprite64Png.toString("base64");

      inserted = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(717341101)`);

        const existingNumbers = await tx
          .select({ catalogNumber: schema.things.catalogNumber })
          .from(schema.things);
        const assignedCatalogNumber = findLowestMissingCatalogNumber(
          existingNumbers.map((r) => r.catalogNumber)
        );

        let pullSlot = 1;
        if (unlimited) {
          const slotRows = await tx
            .select({
              maxSlot: sql<number>`COALESCE(MAX(${schema.things.pullSlot}), 0)`,
            })
            .from(schema.things)
            .where(
              and(
                eq(schema.things.discovererDid, userDid),
                eq(schema.things.pullUtcDate, pullUtcDate)
              )
            );
          pullSlot = Number(slotRows[0]?.maxSlot ?? 0) + 1;
        }

        const [officialCreator] = await tx
          .select({ did: schema.users.did })
          .from(schema.users)
          .where(sql`lower(${schema.users.handle}) = ${UNLIMITED_PULL_HANDLE}`)
          .limit(1);
        const generatedCreatorDid = officialCreator?.did ?? userDid;

        const insertedRows = await tx
          .insert(schema.things)
          .values({
            thingTid,
            catalogNumber: assignedCatalogNumber,
            name: prepared.name,
            canonicalFingerprint: prepared.canonicalFingerprint,
            category: prepared.category,
            subcategory: prepared.subcategory,
            description: prepared.description,
            flavorText: prepared.flavorText,
            uselessTrait: prepared.uselessTrait,
            iconAlt: prepared.iconAlt,
            embedding: prepared.embedding,
            iconUrl: `/api/sprites/${thingTid}`,
            spritePngBase64,
            createdByDid: generatedCreatorDid,
            collectionId: null,
            discovererDid: userDid,
            pullUtcDate,
            pullSlot,
            currentOwnerDid: userDid,
            status: "held",
            transferCount: 0,
            createdAt,
          })
          .returning();

        await tx.execute(sql`
          SELECT setval(
            pg_get_serial_sequence('things', 'catalog_number'),
            GREATEST(COALESCE((SELECT MAX(catalog_number) FROM things), 1), 1),
            true
          )
        `);

        return insertedRows[0]!;
      });
    }

    const catalogNumber = inserted.catalogNumber;

    // Update subcategory usage counter
    await db
      .insert(schema.subcategoryStats)
      .values({
        subcategoryKey: prepared.subcategoryKey,
        macroCategory: prepared.category,
        subcategory: prepared.subcategory,
        pullCount: 1,
        lastUsedAt: createdAt,
      })
      .onConflictDoUpdate({
        target: schema.subcategoryStats.subcategoryKey,
        set: {
          pullCount: sql`${schema.subcategoryStats.pullCount} + 1`,
          lastUsedAt: createdAt,
        },
      });

    // Step 2: Upload S3 sprites + publish canonical `com.giveathing.thing` & `com.giveathing.ledger` (#0) on App PDS in parallel
    const defaultThingRef: StrongRef = {
      uri: `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || userDid}/com.giveathing.thing/${thingTid}`,
      cid: `bafkrei${thingTid}`,
    };

    const [iconUrl, pdsMint] = await Promise.all([
      storeSpriteAssets(thingTid, prepared.sprite64Png, prepared.sprite512Png),
      (async (): Promise<{
        canonicalThingRef: StrongRef;
        ledgerRef: StrongRef | null;
        iconBlobCid: string | null;
      }> => {
        try {
          const minted = await mintCanonicalThingOnAppPds({
            thingTid,
            entryTid,
            catalogNumber,
            name: prepared.name,
            category: prepared.category,
            subcategory: prepared.subcategory,
            description: prepared.description,
            flavorText: prepared.flavorText,
            uselessTrait: prepared.uselessTrait,
            iconPngBuffer: prepared.sprite512Png,
            iconAlt: prepared.iconAlt,
            discoveredByDid: userDid,
            pullUtcDate,
            createdAtIso,
          });
          return {
            canonicalThingRef: minted.thingRef ?? defaultThingRef,
            ledgerRef: minted.ledgerRef ?? null,
            iconBlobCid: minted.iconBlobCid,
          };
        } catch (appPdsErr) {
          console.error("[daily-pull] App PDS mint warning:", appPdsErr);
          return {
            canonicalThingRef: defaultThingRef,
            ledgerRef: null,
            iconBlobCid: null,
          };
        }
      })(),
    ]);

    const { canonicalThingRef, ledgerRef, iconBlobCid } = pdsMint;

    // Step 3: Write `com.giveathing.holding` to the discoverer's own PDS!
    const genesisProvenance: ProvenanceHop[] = [
      {
        sequenceNum: 0,
        owner: userDid,
        handleSnapshot: user.handle,
        via: "daily_pull",
        occurredAt: createdAtIso,
      },
    ];

    const holdingRef = await putUserHoldingOnPds({
      ownerDid: userDid,
      thingTid,
      thingRef: canonicalThingRef,
      catalogNumber,
      name: prepared.name,
      category: prepared.category,
      description: prepared.description,
      iconPngBuffer: prepared.sprite512Png,
      status: "held",
      acquiredAtIso: createdAtIso,
      provenance: genesisProvenance,
    });

    // Step 4: Update `things` iconUrl & AT-URIs, insert `provenance_entries` (#0), `feed_events`, and update/release lock
    await db
      .update(schema.things)
      .set({
        iconUrl,
        iconBlobCid,
        canonicalAtUri: canonicalThingRef.uri,
        canonicalAtCid: canonicalThingRef.cid,
        latestLedgerAtUri: ledgerRef?.uri ?? null,
        latestLedgerAtCid: ledgerRef?.cid ?? null,
        currentHoldingAtUri: holdingRef?.uri ?? null,
      })
      .where(eq(schema.things.thingTid, thingTid));

    await db.insert(schema.provenanceEntries).values({
      entryTid,
      thingTid,
      sequenceNum: 0,
      fromDid: null,
      fromHandleSnapshot: null,
      toDid: userDid,
      toHandleSnapshot: user.handle,
      via: "daily_pull",
      note: null,
      ledgerAtUri: ledgerRef?.uri ?? null,
      ledgerAtCid: ledgerRef?.cid ?? null,
      userProofAtUri: holdingRef?.uri ?? null,
      userProofAtCid: holdingRef?.cid ?? null,
      occurredAt: createdAt,
    });

    const [feedRow] = await db
      .insert(schema.feedEvents)
      .values({
        eventType: "daily_pull",
        actorDid: userDid,
        targetDid: null,
        thingTid,
        sequenceNum: 0,
        note: null,
        createdAt,
      })
      .returning();

    if (!bypassLock) {
      if (unlimited) {
        await db
          .delete(schema.dailyPullLocks)
          .where(
            and(
              eq(schema.dailyPullLocks.did, userDid),
              eq(schema.dailyPullLocks.pullUtcDate, pullUtcDate)
            )
          );
      } else {
        await db
          .update(schema.dailyPullLocks)
          .set({ status: "completed", thingTid })
          .where(
            and(
              eq(schema.dailyPullLocks.did, userDid),
              eq(schema.dailyPullLocks.pullUtcDate, pullUtcDate)
            )
          );
      }
    }

    if (feedRow) {
      broadcastFeedEvent({
        id: feedRow.id,
        eventType: "daily_pull",
        actorDid: userDid,
        targetDid: null,
        thingTid,
        createdAt: createdAtIso,
      });
    }

    // Kick off background replenishment so `daily_pull_cache` stays topped up at 10 items!
    if (!skipCache) {
      void replenishDailyPullCache().catch((err) => {
        console.warn("[daily-pull-cache] Post-pull refill warning:", err);
      });
    }

    return {
      thingTid,
      catalogNumber,
      name: prepared.name,
      category: prepared.category,
      subcategory: prepared.subcategory,
      description: prepared.description,
      flavorText: prepared.flavorText,
      uselessTrait: prepared.uselessTrait,
      iconUrl,
      iconAlt: prepared.iconAlt,
      pullUtcDate,
      canonicalAtUri: canonicalThingRef.uri,
      holdingAtUri: holdingRef?.uri ?? null,
      nextPullUtcIso: getNextUtcMidnightIso(),
      unlimitedPulls: unlimited,
    };
  } catch (err) {
    if (!bypassLock) {
      await db
        .delete(schema.dailyPullLocks)
        .where(
          and(
            eq(schema.dailyPullLocks.did, userDid),
            eq(schema.dailyPullLocks.pullUtcDate, pullUtcDate),
            eq(schema.dailyPullLocks.status, "in_progress")
          )
        );
    }
    throw err;
  }
}

let catalogHealInFlight = false;

/**
 * Checks for any skipped interior catalog numbers `< MAX(catalog_number)` (such as #0011)
 * and automatically generates missing Things via `@giveathing.com` so the catalog stays contiguous.
 */
export async function healMissingCatalogGaps(maxToFill = 5): Promise<number[]> {
  if (catalogHealInFlight) return [];
  if (!process.env.DATABASE_URL || !process.env.GEMINI_API_KEY) return [];

  catalogHealInFlight = true;
  const filled: number[] = [];
  const HEAL_LOCK_DID = "__catalog_heal__";
  const HEAL_LOCK_DATE = "global";
  let acquiredDbLock = false;

  try {
    const db = getDb();
    const initialRows = await db
      .select({ catalogNumber: schema.things.catalogNumber })
      .from(schema.things);
    const initialMissing = findInteriorMissingCatalogNumbers(
      initialRows.map((r) => r.catalogNumber)
    );
    if (initialMissing.length === 0) {
      return [];
    }

    // Cross-process lease so rolling deploys never double-heal the same gap
    const [existingHealLock] = await db
      .select()
      .from(schema.dailyPullLocks)
      .where(
        and(
          eq(schema.dailyPullLocks.did, HEAL_LOCK_DID),
          eq(schema.dailyPullLocks.pullUtcDate, HEAL_LOCK_DATE)
        )
      )
      .limit(1);

    if (
      existingHealLock &&
      existingHealLock.status === "in_progress" &&
      Date.now() - existingHealLock.lockedAt.getTime() < 180_000
    ) {
      return [];
    }

    await db
      .insert(schema.dailyPullLocks)
      .values({
        did: HEAL_LOCK_DID,
        pullUtcDate: HEAL_LOCK_DATE,
        status: "in_progress",
        lockedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.dailyPullLocks.did,
          schema.dailyPullLocks.pullUtcDate,
        ],
        set: { status: "in_progress", lockedAt: new Date() },
      });
    acquiredDbLock = true;

    // Resolve the official @giveathing.com account to own/discover backfilled gaps
    let [appUser] = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.handle}) = ${UNLIMITED_PULL_HANDLE}`)
      .limit(1);

    if (!appUser) {
      const configuredDid = process.env.NEXT_PUBLIC_APP_ATPROTO_DID?.trim();
      if (configuredDid && !configuredDid.includes("replace_with")) {
        const [byDid] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.did, configuredDid))
          .limit(1);
        appUser = byDid;
      }
    }

    if (!appUser) {
      const appAgent = await getAppPdsAgent();
      if (appAgent?.session?.did) {
        const insertedUsers = await db
          .insert(schema.users)
          .values({
            did: appAgent.session.did,
            handle: appAgent.session.handle || UNLIMITED_PULL_HANDLE,
            displayName: "Give a Thing",
          })
          .onConflictDoUpdate({
            target: schema.users.did,
            set: { updatedAt: new Date() },
          })
          .returning();
        appUser = insertedUsers[0];
      }
    }

    if (!appUser) {
      console.warn(
        `[catalog-heal] Found missing catalog number(s) [${initialMissing.join(", ")}], but @giveathing.com user record is not yet present.`
      );
      return [];
    }

    const limit = Math.min(initialMissing.length, maxToFill);
    for (let i = 0; i < limit; i++) {
      const currentRows = await db
        .select({ catalogNumber: schema.things.catalogNumber })
        .from(schema.things);
      const stillMissing = findInteriorMissingCatalogNumbers(
        currentRows.map((r) => r.catalogNumber)
      );
      if (stillMissing.length === 0) {
        break;
      }

      console.log(
        `[catalog-heal] Filling skipped catalog number #${String(stillMissing[0]).padStart(4, "0")}...`
      );
      const minted = await executeDailyPull(appUser.did, {
        bypassLock: true,
        skipCache: true,
      });
      filled.push(minted.catalogNumber);
      console.log(
        `[catalog-heal] Filled #${String(minted.catalogNumber).padStart(4, "0")}: ${minted.name}`
      );
    }

    return filled;
  } finally {
    if (acquiredDbLock) {
      try {
        const db = getDb();
        await db
          .delete(schema.dailyPullLocks)
          .where(
            and(
              eq(schema.dailyPullLocks.did, HEAL_LOCK_DID),
              eq(schema.dailyPullLocks.pullUtcDate, HEAL_LOCK_DATE)
            )
          );
      } catch {
        // Ignore cleanup error
      }
    }
    catalogHealInFlight = false;
  }
}
