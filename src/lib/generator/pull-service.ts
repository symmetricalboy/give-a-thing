import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { nextTid, type ProvenanceHop, type StrongRef } from "@/lib/lexicons";
import { mintCanonicalThingOnAppPds } from "@/lib/atproto/app-pds";
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

/**
 * Executes a player's once-per-UTC-day pull (or unlimited pulls when signed in as `@giveathing.com`):
 * 1. Acquires an atomic `(did, pull_utc_date)` in-progress lock in PostgreSQL.
 * 2. Samples an under-used `(MacroCategory, Subcategory, Twist)` seed.
 * 3. Runs `gemini-4-carbon` + 4-layer zero-duplicate verification (`canonical_fingerprint` + `gemini-embedding-2` HNSW).
 * 4. Renders & pixel-snaps a 16-bit RPG sprite with `gemini-nano-banana-2.1` + `sharp`.
 * 5. Mints immutable `com.giveathing.thing` & `com.giveathing.ledger` on `@giveathing.com`'s PDS,
 *    and writes `com.giveathing.holding` to the discoverer's own PDS.
 */
export async function executeDailyPull(
  userDid: string
): Promise<PullResultPayload> {
  const db = getDb();
  const pullUtcDate = getCurrentUtcDateString();

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
          eq(schema.things.pullUtcDate, pullUtcDate)
        )
      )
      .limit(1);

    if (existingToday[0]) {
      throw new DailyPullAlreadyUsedError(existingToday[0].thingTid);
    }
  }

  // Acquire concurrency lock so double-clicks don't trigger parallel Gemini calls
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

  try {
    let pullSlot = 1;
    if (unlimited) {
      const todayCountRes = await db
        .select({ value: count() })
        .from(schema.things)
        .where(
          and(
            eq(schema.things.discovererDid, userDid),
            eq(schema.things.pullUtcDate, pullUtcDate)
          )
        );
      pullSlot = Number(todayCountRes[0]?.value ?? 0) + 1;
    }

    // Load subcategory usage counts for inverse-frequency sampling
    const statRows = await db.select().from(schema.subcategoryStats);
    const usageMap = new Map<string, number>();
    for (const s of statRows) {
      usageMap.set(s.subcategoryKey, s.pullCount);
    }
    const seed = sampleCategorySeed(usageMap);

    // Fetch existing things in same macro-category + recent global names for Layer 1 negative prompting
    const [sameCatRows, recentGlobalRows] = await Promise.all([
      db
        .select({ name: schema.things.name })
        .from(schema.things)
        .where(eq(schema.things.category, seed.macroLabel))
        .orderBy(desc(schema.things.createdAt))
        .limit(50),
      db
        .select({ name: schema.things.name })
        .from(schema.things)
        .orderBy(desc(schema.things.createdAt))
        .limit(80),
    ]);

    const existingInSubcategory = sameCatRows.map((r) => r.name);
    const overusedWords = findOverusedWords(
      recentGlobalRows.map((r) => r.name)
    );

    // Stateful retry loop with Gemini 4 Carbon + pgvector semantic deduplication
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

    // Generate & post-process the 16-bit inventory sprite
    const rawPng = await generate16BitSpritePng(chosenConcept);
    const { sprite64Png, sprite512Png } = await processInto16BitSprite(rawPng);

    const thingTid = nextTid();
    const entryTid = nextTid();
    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();

    const iconUrl = await storeSpriteAssets(
      thingTid,
      sprite64Png,
      sprite512Png
    );
    const spritePngBase64 = sprite64Png.toString("base64");

    // Step 1: Insert row into Postgres first so `bigserial` assigns sequential `catalogNumber`
    const insertedRows = await db
      .insert(schema.things)
      .values({
        thingTid,
        name: chosenConcept.name,
        canonicalFingerprint: chosenFingerprint,
        category: seed.macroLabel,
        subcategory: seed.subcategory,
        description: chosenConcept.description,
        flavorText: chosenConcept.flavorText,
        uselessTrait: chosenConcept.uselessTrait,
        iconAlt: chosenConcept.iconAlt,
        embedding: chosenEmbedding,
        iconUrl,
        spritePngBase64,
        discovererDid: userDid,
        pullUtcDate,
        pullSlot,
        currentOwnerDid: userDid,
        status: "held",
        transferCount: 0,
        createdAt,
      })
      .returning();

    const inserted = insertedRows[0]!;
    const catalogNumber = inserted.catalogNumber;

    // Update subcategory usage counter
    await db
      .insert(schema.subcategoryStats)
      .values({
        subcategoryKey: seed.subcategoryKey,
        macroCategory: seed.macroLabel,
        subcategory: seed.subcategory,
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

    // Step 2: Publish canonical `com.giveathing.thing` + `com.giveathing.ledger` (#0) on App PDS
    let canonicalThingRef: StrongRef = {
      uri: `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || userDid}/com.giveathing.thing/${thingTid}`,
      cid: `bafkrei${thingTid}`,
    };
    let ledgerRef: StrongRef | null = null;
    let iconBlobCid: string | null = null;

    try {
      const minted = await mintCanonicalThingOnAppPds({
        thingTid,
        entryTid,
        catalogNumber,
        name: chosenConcept.name,
        category: seed.macroLabel,
        subcategory: seed.subcategory,
        description: chosenConcept.description,
        flavorText: chosenConcept.flavorText,
        uselessTrait: chosenConcept.uselessTrait,
        iconPngBuffer: sprite512Png,
        iconAlt: chosenConcept.iconAlt,
        discoveredByDid: userDid,
        pullUtcDate,
        createdAtIso,
      });
      if (minted.thingRef) canonicalThingRef = minted.thingRef;
      if (minted.ledgerRef) ledgerRef = minted.ledgerRef;
      iconBlobCid = minted.iconBlobCid;
    } catch (appPdsErr) {
      console.error("[daily-pull] App PDS mint warning:", appPdsErr);
    }

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
      name: chosenConcept.name,
      category: seed.macroLabel,
      description: chosenConcept.description,
      iconPngBuffer: sprite512Png,
      status: "held",
      acquiredAtIso: createdAtIso,
      provenance: genesisProvenance,
    });

    // Step 4: Update `things` AT-URIs, insert `provenance_entries` (#0), `feed_events`, and update/release lock
    await db
      .update(schema.things)
      .set({
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

    return {
      thingTid,
      catalogNumber,
      name: chosenConcept.name,
      category: seed.macroLabel,
      subcategory: seed.subcategory,
      description: chosenConcept.description,
      flavorText: chosenConcept.flavorText,
      uselessTrait: chosenConcept.uselessTrait,
      iconUrl,
      iconAlt: chosenConcept.iconAlt,
      pullUtcDate,
      canonicalAtUri: canonicalThingRef.uri,
      holdingAtUri: holdingRef?.uri ?? null,
      nextPullUtcIso: getNextUtcMidnightIso(),
      unlimitedPulls: unlimited,
    };
  } catch (err) {
    await db
      .delete(schema.dailyPullLocks)
      .where(
        and(
          eq(schema.dailyPullLocks.did, userDid),
          eq(schema.dailyPullLocks.pullUtcDate, pullUtcDate),
          eq(schema.dailyPullLocks.status, "in_progress")
        )
      );
    throw err;
  }
}
