import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  getAppPdsAgent,
} from "@/lib/atproto/app-pds";
import {
  deleteUserFavoriteOnPds,
  deleteUserHoldingOnPds,
  deleteUserOfferOnPds,
  getUserAgent,
  putUserHoldingOnPds,
} from "@/lib/atproto/user-pds";
import { broadcastFeedEvent } from "@/lib/feed/bus";
import { computeCanonicalFingerprint } from "@/lib/generator/dedup";
import { embedThingText } from "@/lib/generator/gemini";
import {
  findLowestMissingCatalogNumber,
  getCurrentUtcDateString,
  getNextUtcMidnightIso,
  isUnlimitedPullAccount,
} from "@/lib/generator/pull-service";
import {
  LEXICON_NSIDS,
  nextTid,
  type ProvenanceHop,
  type StrongRef,
} from "@/lib/lexicons";
import { storeSpriteAssets } from "@/lib/storage";
import {
  estimateMysteryBoxPayoutBreakdown,
  MAX_PAID_PULL_CENTS,
  MAX_PLATFORM_FEE_BPS,
} from "@/lib/stripe/pricing";

export const MIN_COLLECTION_ITEMS = 5;
export const MAX_COLLECTION_ITEMS = 50;
export const REQUIRED_SPRITE_DIMENSION = 512;
export const MAX_SPRITE_BYTES = 1_000_000;

export const CreatorThingDraftItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name must be 120 characters or fewer."),
  subcategory: z
    .string()
    .trim()
    .min(2, "Subcategory must be at least 2 characters.")
    .max(120, "Subcategory must be 120 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters.")
    .max(500, "Description must be 500 characters or fewer."),
  flavorText: z
    .string()
    .trim()
    .min(3, "Flavor text must be at least 3 characters.")
    .max(280, "Flavor text must be 280 characters or fewer."),
  uselessTrait: z
    .string()
    .trim()
    .min(2, "Pointless trait must be at least 2 characters.")
    .max(80, "Pointless trait must be 80 characters or fewer."),
  iconAlt: z
    .string()
    .trim()
    .min(5, "Sprite alt text must be at least 5 characters.")
    .max(300, "Sprite alt text must be 300 characters or fewer."),
  spriteDataUrl: z
    .string()
    .startsWith("data:image/png;base64,", "Sprite must be a PNG image."),
});

export type CreatorThingDraftItem = z.infer<typeof CreatorThingDraftItemSchema>;

export const PublishCollectionInputSchema = z.object({
  collectionName: z
    .string()
    .trim()
    .min(2, "Collection name must be at least 2 characters.")
    .max(100, "Collection name must be 100 characters or fewer."),
  collectionDescription: z
    .string()
    .trim()
    .max(280, "Collection description must be 280 characters or fewer.")
    .optional(),
  priceCents: z
    .number()
    .int()
    .min(0)
    .max(MAX_PAID_PULL_CENTS)
    .optional()
    .default(0),
  platformFeeBps: z
    .number()
    .int()
    .min(0)
    .max(MAX_PLATFORM_FEE_BPS)
    .optional()
    .default(0),
  items: z
    .array(CreatorThingDraftItemSchema)
    .min(
      MIN_COLLECTION_ITEMS,
      `Collections must include at least ${MIN_COLLECTION_ITEMS} unique things.`
    )
    .max(
      MAX_COLLECTION_ITEMS,
      `Collections can include up to ${MAX_COLLECTION_ITEMS} things at once.`
    ),
});

export const UpdateCollectionPricingInputSchema = z.object({
  priceCents: z.number().int().min(0).max(MAX_PAID_PULL_CENTS),
  platformFeeBps: z.number().int().min(0).max(MAX_PLATFORM_FEE_BPS).default(0),
});

export type PublishCollectionInput = z.infer<
  typeof PublishCollectionInputSchema
>;

export interface ValidatedCreatorSprite {
  sprite512Png: Buffer;
  sprite64Png: Buffer;
  hasTransparency: boolean;
}

/**
 * Validates that an uploaded or generated sprite buffer is a genuine `512x512` PNG
 * within the 1 MB lexicon blob limit, strips EXIF metadata while preserving alpha,
 * and produces both 512x512 and 64x64 PNG buffers.
 */
export async function validateAndNormalize512Png(
  rawBuffer: Buffer
): Promise<ValidatedCreatorSprite> {
  if (rawBuffer.byteLength === 0) {
    throw new Error("Sprite PNG file is empty.");
  }
  if (rawBuffer.byteLength > MAX_SPRITE_BYTES) {
    throw new Error("Sprite PNG must be 1 MB or smaller.");
  }

  let meta: Metadata;
  try {
    meta = await sharp(rawBuffer).metadata();
  } catch {
    throw new Error("Invalid image file—please upload a valid 512x512 PNG.");
  }

  if (meta.format !== "png") {
    throw new Error(
      `Sprite must be a PNG image (received ${meta.format ?? "unknown format"}).`
    );
  }
  if (
    meta.width !== REQUIRED_SPRITE_DIMENSION ||
    meta.height !== REQUIRED_SPRITE_DIMENSION
  ) {
    throw new Error(
      `Sprite must be exactly ${REQUIRED_SPRITE_DIMENSION}x${REQUIRED_SPRITE_DIMENSION}px (received ${meta.width ?? 0}x${meta.height ?? 0}px).`
    );
  }

  const { data: alphaCheck } = await sharp(rawBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hasTransparency = false;
  for (let i = 3; i < alphaCheck.length; i += 16) {
    if (alphaCheck[i]! < 250) {
      hasTransparency = true;
      break;
    }
  }

  let sprite512Png = await sharp(rawBuffer)
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (sprite512Png.byteLength > MAX_SPRITE_BYTES) {
    sprite512Png = await sharp(rawBuffer)
      .ensureAlpha()
      .png({ compressionLevel: 9, palette: true, colors: 128 })
      .toBuffer();
  }

  const sprite64Png = await sharp(sprite512Png)
    .resize(64, 64, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { sprite512Png, sprite64Png, hasTransparency };
}

export function decodePngDataUrl(dataUrl: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("Sprite must be a valid PNG data URL.");
  }
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

/**
 * Validates that every item in a collection draft has a distinct canonical fingerprint
 * (preventing duplicate/repeated items within the same collection) and returns the
 * parsed payload + fingerprints.
 */
export function validateCollectionUniqueness(raw: unknown): {
  parsed: PublishCollectionInput;
  fingerprints: string[];
} {
  const parsed = PublishCollectionInputSchema.parse(raw);
  const seenFingerprints = new Map<string, number>();
  const fingerprints: string[] = [];

  parsed.items.forEach((item, idx) => {
    const fp = computeCanonicalFingerprint(item.name);
    if (!fp) {
      throw new Error(`Thing #${idx + 1} needs a descriptive, unique name.`);
    }
    const existingIdx = seenFingerprints.get(fp);
    if (existingIdx !== undefined) {
      throw new Error(
        `Every thing in a collection must be unique! Thing #${idx + 1} ("${item.name}") is too similar in name to Thing #${existingIdx + 1} ("${parsed.items[existingIdx]!.name}").`
      );
    }
    seenFingerprints.set(fp, idx);
    fingerprints.push(fp);
  });

  return { parsed, fingerprints };
}

async function resolveCreatorPdsAgent(creatorDid: string) {
  const userAgent = await getUserAgent(creatorDid);
  if (userAgent) return userAgent;
  const appAgent = await getAppPdsAgent();
  if (appAgent?.session?.did === creatorDid) return appAgent;
  return null;
}

/**
 * Publishes a complete creator collection (>= 5 unique things):
 * 1. Validates all `.thing` fields, uniqueness, and 512x512 PNG dimensions.
 * 2. Stores genesis `com.giveathing.thing/<thingTid>` records directly in the creator's PDS
 *    (with `category = collectionName` and `createdBy = creatorDid`).
 * 3. Inserts the `thing_collections` record and `"unclaimed"` `things` rows into PostgreSQL
 *    so the collection immediately appears as a Mystery Box draw on the creator's profile.
 */
export async function publishCreatorCollection(
  creatorDid: string,
  rawInput: unknown
) {
  const { parsed, fingerprints } = validateCollectionUniqueness(rawInput);
  const db = getDb();

  const [creator] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, creatorDid))
    .limit(1);

  if (!creator) {
    throw new Error("Creator account not found. Please log in again.");
  }

  const priceCents = parsed.priceCents ?? 0;
  const platformFeeBps = priceCents === 0 ? 0 : (parsed.platformFeeBps ?? 0);
  const breakdown = estimateMysteryBoxPayoutBreakdown(priceCents, platformFeeBps);
  if (!breakdown.valid) {
    throw new Error(breakdown.validationError ?? "Invalid collection pricing.");
  }
  if (priceCents > 0 && (!creator.stripeAccountId || !creator.stripePayoutsReady)) {
    throw new Error(
      "Connect and complete your payout method setup before setting a paid price on a mystery box."
    );
  }

  const pdsAgent = await resolveCreatorPdsAgent(creatorDid);
  if (!pdsAgent) {
    throw new Error(
      "Your ATmosphere session needs to be refreshed so we can store the genesis .thing records in your PDS. Please log out and click LOGIN again!"
    );
  }

  // Check catalog fingerprint collisions up front before uploading sprites
  const existingCollisions = await db
    .select({
      name: schema.things.name,
      catalogNumber: schema.things.catalogNumber,
      canonicalFingerprint: schema.things.canonicalFingerprint,
    })
    .from(schema.things)
    .where(inArray(schema.things.canonicalFingerprint, fingerprints));

  if (existingCollisions[0]) {
    throw new Error(
      `"${existingCollisions[0].name}" collides with existing Catalog #${String(existingCollisions[0].catalogNumber).padStart(4, "0")}. Give that item a distinct name!`
    );
  }

  // Validate all 512x512 PNGs & compute semantic embeddings
  const preparedItems: Array<{
    draft: CreatorThingDraftItem;
    fingerprint: string;
    thingTid: string;
    sprite512Png: Buffer;
    sprite64Png: Buffer;
    iconUrl: string;
    embedding: number[];
  }> = [];

  for (let i = 0; i < parsed.items.length; i++) {
    const draft = parsed.items[i]!;
    const fp = fingerprints[i]!;
    const rawBuf = decodePngDataUrl(draft.spriteDataUrl);
    const { sprite512Png, sprite64Png } =
      await validateAndNormalize512Png(rawBuf);
    const thingTid = nextTid();
    const iconUrl = await storeSpriteAssets(thingTid, sprite64Png, sprite512Png);

    let embedding: number[];
    if (process.env.GEMINI_API_KEY?.trim()) {
      const embText = `${draft.name} — ${parsed.collectionName} (${draft.subcategory}): ${draft.description}`;
      embedding = await embedThingText(embText);
    } else {
      embedding = new Array<number>(768).fill(0);
    }

    preparedItems.push({
      draft,
      fingerprint: fp,
      thingTid,
      sprite512Png,
      sprite64Png,
      iconUrl,
      embedding,
    });
  }

  const collectionTid = nextTid();
  const createdAt = new Date();
  const createdAtIso = createdAt.toISOString();
  const pullUtcDate = getCurrentUtcDateString(createdAt);

  // Atomically allocate sequential/gap-filled catalog numbers & insert collection + unclaimed things
  const insertedThings = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(717341101)`);

    const existingNums = await tx
      .select({ catalogNumber: schema.things.catalogNumber })
      .from(schema.things);
    const numSet = new Set(existingNums.map((r) => r.catalogNumber));

    const slotRows = await tx
      .select({
        maxSlot: sql<number>`COALESCE(MAX(${schema.things.pullSlot}), 0)`,
      })
      .from(schema.things)
      .where(
        and(
          eq(schema.things.discovererDid, creatorDid),
          eq(schema.things.pullUtcDate, pullUtcDate)
        )
      );
    let nextSlot = Number(slotRows[0]?.maxSlot ?? 0) + 1;

    await tx.insert(schema.thingCollections).values({
      collectionTid,
      creatorDid,
      name: parsed.collectionName,
      description: parsed.collectionDescription || null,
      totalItems: preparedItems.length,
      priceCents,
      platformFeeBps,
      createdAt,
    });

    const createdRows: Array<typeof schema.things.$inferSelect> = [];

    for (const item of preparedItems) {
      const assignedCatalogNumber = findLowestMissingCatalogNumber(numSet);
      numSet.add(assignedCatalogNumber);

      const [row] = await tx
        .insert(schema.things)
        .values({
          thingTid: item.thingTid,
          catalogNumber: assignedCatalogNumber,
          name: item.draft.name,
          canonicalFingerprint: item.fingerprint,
          category: parsed.collectionName,
          subcategory: item.draft.subcategory,
          description: item.draft.description,
          flavorText: item.draft.flavorText,
          uselessTrait: item.draft.uselessTrait,
          iconAlt: item.draft.iconAlt,
          embedding: item.embedding,
          iconUrl: item.iconUrl,
          // Store full 512x512 PNG so custom sticker/artwork uploads retain 100% fidelity
          spritePngBase64: item.sprite512Png.toString("base64"),
          createdByDid: creatorDid,
          collectionId: collectionTid,
          discovererDid: creatorDid,
          pullUtcDate,
          pullSlot: nextSlot++,
          currentOwnerDid: creatorDid,
          status: "unclaimed",
          transferCount: 0,
          createdAt,
        })
        .returning();

      createdRows.push(row!);
    }

    await tx.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('things', 'catalog_number'),
        GREATEST(COALESCE((SELECT MAX(catalog_number) FROM things), 1), 1),
        true
      )
    `);

    return createdRows;
  });

  // Publish genesis `com.giveathing.thing/<thingTid>` records to the CREATOR'S own PDS!
  for (let i = 0; i < preparedItems.length; i++) {
    const prep = preparedItems[i]!;
    const dbRow = insertedThings[i]!;

    try {
      const blobRes = await pdsAgent.uploadBlob(prep.sprite512Png, {
        encoding: "image/png",
      });
      const blobRef = blobRes.data.blob;
      const iconBlobCid =
        typeof blobRef.ref === "object" && "$link" in blobRef.ref
          ? String(blobRef.ref.$link)
          : blobRef.ref.toString();

      const thingRes = await pdsAgent.com.atproto.repo.putRecord({
        repo: creatorDid,
        collection: LEXICON_NSIDS.THING,
        rkey: prep.thingTid,
        record: {
          $type: LEXICON_NSIDS.THING,
          catalogNumber: dbRow.catalogNumber,
          name: prep.draft.name,
          category: parsed.collectionName,
          subcategory: prep.draft.subcategory,
          description: prep.draft.description,
          flavorText: prep.draft.flavorText,
          uselessTrait: prep.draft.uselessTrait,
          icon: blobRef,
          iconAlt: prep.draft.iconAlt,
          createdBy: creatorDid,
          discoveredBy: creatorDid,
          pullDate: pullUtcDate,
          createdAt: createdAtIso,
        },
      });

      await db
        .update(schema.things)
        .set({
          iconBlobCid,
          canonicalAtUri: thingRes.data.uri,
          canonicalAtCid: thingRes.data.cid,
        })
        .where(eq(schema.things.thingTid, prep.thingTid));
    } catch (pdsErr) {
      console.error(
        `[maker] Creator PDS genesis putRecord warning for ${prep.thingTid}:`,
        pdsErr
      );
    }
  }

  return {
    collectionTid,
    name: parsed.collectionName,
    totalItems: insertedThings.length,
    priceCents,
    platformFeeBps,
    catalogNumbers: insertedThings.map((r) => r.catalogNumber),
  };
}

export async function updateCreatorCollectionPricing(params: {
  creatorDid: string;
  collectionTid: string;
  rawInput: unknown;
}) {
  const parsed = UpdateCollectionPricingInputSchema.parse(params.rawInput);
  const priceCents = parsed.priceCents;
  const platformFeeBps = priceCents === 0 ? 0 : parsed.platformFeeBps;

  const breakdown = estimateMysteryBoxPayoutBreakdown(priceCents, platformFeeBps);
  if (!breakdown.valid) {
    throw new Error(breakdown.validationError ?? "Invalid collection pricing.");
  }

  const db = getDb();
  const [[creator], [collection]] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, params.creatorDid))
      .limit(1),
    db
      .select()
      .from(schema.thingCollections)
      .where(eq(schema.thingCollections.collectionTid, params.collectionTid))
      .limit(1),
  ]);

  if (!creator) {
    throw new Error("Creator account not found. Please log in again.");
  }
  if (!collection) {
    throw new Error("Collection not found.");
  }
  if (collection.creatorDid !== params.creatorDid) {
    throw new Error("Only the collection creator can update its pricing.");
  }

  if (priceCents > 0 && (!creator.stripeAccountId || !creator.stripePayoutsReady)) {
    throw new Error(
      "Connect and complete your payout method setup before charging for pulls on a mystery box."
    );
  }

  const [updated] = await db
    .update(schema.thingCollections)
    .set({
      priceCents,
      platformFeeBps,
    })
    .where(eq(schema.thingCollections.collectionTid, params.collectionTid))
    .returning();

  return updated!;
}

/**
 * Releases any `"reserved"` items whose pending Stripe Checkout Session has expired
 * back to `"unclaimed"` so abandoned checkouts never permanently lock Mystery Box items.
 */
export async function releaseExpiredCollectionReservations(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const expiredRows = await db
    .update(schema.collectionPurchases)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.collectionPurchases.status, "pending"),
        lte(schema.collectionPurchases.expiresAt, now)
      )
    )
    .returning({ thingTid: schema.collectionPurchases.thingTid });

  if (expiredRows.length > 0) {
    const tids = expiredRows.map((r) => r.thingTid);
    await db
      .update(schema.things)
      .set({ status: "unclaimed" })
      .where(
        and(
          inArray(schema.things.thingTid, tids),
          eq(schema.things.status, "reserved")
        )
      );
  }
}

export class CreatorCannotPullOwnBoxError extends Error {
  constructor() {
    super("You can't pull from your own mystery box collection!");
    this.name = "CreatorCannotPullOwnBoxError";
  }
}

export class CollectionAlreadyClaimedTodayError extends Error {
  constructor() {
    super(
      "You've already gotten a thing from this collection today. Come back tomorrow for another thing!"
    );
    this.name = "CollectionAlreadyClaimedTodayError";
  }
}

export class CollectionSoldOutError extends Error {
  constructor() {
    super("This mystery box collection has run out of things!");
    this.name = "CollectionSoldOutError";
  }
}

/**
 * Shared PDS ledger #0 + recipient PDS holding + provenance + live feed broadcast
 * for both free Mystery Box draws and fulfilled paid Mystery Box purchases.
 */
export async function finalizeCollectionItemDelivery(params: {
  thing: typeof schema.things.$inferSelect;
  creatorDid: string;
  recipientDid: string;
  recipientHandle: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const entryTid = nextTid();

  const canonicalThingRef: StrongRef = {
    uri:
      params.thing.canonicalAtUri ??
      `at://${params.creatorDid}/com.giveathing.thing/${params.thing.thingTid}`,
    cid: params.thing.canonicalAtCid ?? `bafkrei${params.thing.thingTid}`,
  };

  let ledgerRef: StrongRef | null = null;
  try {
    const appAgent = await getAppPdsAgent();
    if (appAgent?.session?.did) {
      const ledgerRes = await appAgent.com.atproto.repo.putRecord({
        repo: appAgent.session.did,
        collection: LEXICON_NSIDS.LEDGER,
        rkey: entryTid,
        record: {
          $type: LEXICON_NSIDS.LEDGER,
          thing: canonicalThingRef,
          sequenceNum: 0,
          owner: params.recipientDid,
          via: "daily_pull",
          occurredAt: nowIso,
        },
      });
      ledgerRef = { uri: ledgerRes.data.uri, cid: ledgerRes.data.cid };
    }
  } catch (err) {
    console.warn("[collection-delivery] App PDS ledger warning:", err);
  }

  const spriteBuf = params.thing.spritePngBase64
    ? Buffer.from(params.thing.spritePngBase64, "base64")
    : undefined;
  let sprite512Buf: Buffer | undefined = spriteBuf;
  if (spriteBuf) {
    const m = await sharp(spriteBuf).metadata();
    if (m.width !== 512 || m.height !== 512) {
      sprite512Buf = await sharp(spriteBuf)
        .resize(512, 512, { kernel: sharp.kernel.nearest })
        .png({ compressionLevel: 9, palette: true, colors: 48 })
        .toBuffer();
    }
  }

  const genesisProvenance: ProvenanceHop[] = [
    {
      sequenceNum: 0,
      owner: params.recipientDid,
      handleSnapshot: params.recipientHandle,
      via: "daily_pull",
      occurredAt: nowIso,
    },
  ];

  const holdingRef = await putUserHoldingOnPds({
    ownerDid: params.recipientDid,
    thingTid: params.thing.thingTid,
    thingRef: canonicalThingRef,
    catalogNumber: params.thing.catalogNumber,
    name: params.thing.name,
    category: params.thing.category,
    description: params.thing.description,
    iconPngBuffer: sprite512Buf,
    status: "held",
    acquiredAtIso: nowIso,
    provenance: genesisProvenance,
  });

  await db
    .update(schema.things)
    .set({
      latestLedgerAtUri: ledgerRef?.uri ?? null,
      latestLedgerAtCid: ledgerRef?.cid ?? null,
      currentHoldingAtUri: holdingRef?.uri ?? null,
    })
    .where(eq(schema.things.thingTid, params.thing.thingTid));

  await db.insert(schema.provenanceEntries).values({
    entryTid,
    thingTid: params.thing.thingTid,
    sequenceNum: 0,
    fromDid: params.creatorDid,
    fromHandleSnapshot: null,
    toDid: params.recipientDid,
    toHandleSnapshot: params.recipientHandle,
    via: "daily_pull",
    note: null,
    ledgerAtUri: ledgerRef?.uri ?? null,
    ledgerAtCid: ledgerRef?.cid ?? null,
    userProofAtUri: holdingRef?.uri ?? null,
    userProofAtCid: holdingRef?.cid ?? null,
    occurredAt: now,
  });

  const [feedRow] = await db
    .insert(schema.feedEvents)
    .values({
      eventType: "daily_pull",
      actorDid: params.recipientDid,
      targetDid: null,
      thingTid: params.thing.thingTid,
      sequenceNum: 0,
      note: null,
      createdAt: now,
    })
    .returning();

  if (feedRow) {
    broadcastFeedEvent({
      id: feedRow.id,
      eventType: "daily_pull",
      actorDid: params.recipientDid,
      targetDid: null,
      thingTid: params.thing.thingTid,
      createdAt: nowIso,
    });
  }
}

/**
 * Draws a random unclaimed Thing from a creator's FREE profile Mystery Box collection,
 * enforcing the once-per-UTC-day rule and blocking creators from pulling on their own boxes.
 */
export async function claimFromCollectionMysteryBox(params: {
  collectionTid: string;
  claimerDid: string;
}) {
  await releaseExpiredCollectionReservations();

  const db = getDb();
  const pullUtcDate = getCurrentUtcDateString();

  const [collection] = await db
    .select()
    .from(schema.thingCollections)
    .where(eq(schema.thingCollections.collectionTid, params.collectionTid))
    .limit(1);

  if (!collection) {
    throw new Error("Collection not found.");
  }

  // Strictly block ALL users (including @giveathing.com) from pulling on their own Mystery Boxes
  if (collection.creatorDid === params.claimerDid) {
    throw new CreatorCannotPullOwnBoxError();
  }

  if (collection.priceCents > 0) {
    throw new Error(
      "This mystery box requires payment—use the Buy button to purchase a pull!"
    );
  }

  const [claimer] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, params.claimerDid))
    .limit(1);

  if (!claimer) {
    throw new Error("Player account not found. Please log in again.");
  }

  const unlimited = isUnlimitedPullAccount(claimer);

  if (!unlimited) {
    const [existingClaim] = await db
      .select()
      .from(schema.collectionDailyClaims)
      .where(
        and(
          eq(
            schema.collectionDailyClaims.collectionTid,
            params.collectionTid
          ),
          eq(schema.collectionDailyClaims.claimerDid, params.claimerDid),
          eq(schema.collectionDailyClaims.pullUtcDate, pullUtcDate)
        )
      )
      .limit(1);

    if (existingClaim) {
      throw new CollectionAlreadyClaimedTodayError();
    }
  }

  // Atomically pick a random unclaimed item from the collection
  const claimed = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(717341102)`);

    if (!unlimited) {
      const [doubleCheck] = await tx
        .select()
        .from(schema.collectionDailyClaims)
        .where(
          and(
            eq(
              schema.collectionDailyClaims.collectionTid,
              params.collectionTid
            ),
            eq(schema.collectionDailyClaims.claimerDid, params.claimerDid),
            eq(schema.collectionDailyClaims.pullUtcDate, pullUtcDate)
          )
        )
        .limit(1);
      if (doubleCheck) {
        throw new CollectionAlreadyClaimedTodayError();
      }
    }

    const unclaimedRows = await tx
      .select()
      .from(schema.things)
      .where(
        and(
          eq(schema.things.collectionId, params.collectionTid),
          eq(schema.things.status, "unclaimed")
        )
      );

    if (unclaimedRows.length === 0) {
      throw new CollectionSoldOutError();
    }

    const chosen =
      unclaimedRows[Math.floor(Math.random() * unclaimedRows.length)]!;

    const slotRows = await tx
      .select({
        maxSlot: sql<number>`COALESCE(MAX(${schema.things.pullSlot}), 0)`,
      })
      .from(schema.things)
      .where(
        and(
          eq(schema.things.discovererDid, params.claimerDid),
          eq(schema.things.pullUtcDate, pullUtcDate)
        )
      );
    const nextSlot = Number(slotRows[0]?.maxSlot ?? 0) + 1;

    const [updatedThing] = await tx
      .update(schema.things)
      .set({
        status: "held",
        discovererDid: params.claimerDid,
        currentOwnerDid: params.claimerDid,
        pullUtcDate,
        pullSlot: nextSlot,
      })
      .where(
        and(
          eq(schema.things.thingTid, chosen.thingTid),
          eq(schema.things.status, "unclaimed")
        )
      )
      .returning();

    if (!updatedThing) {
      throw new CollectionSoldOutError();
    }

    if (!unlimited) {
      await tx.insert(schema.collectionDailyClaims).values({
        collectionTid: params.collectionTid,
        claimerDid: params.claimerDid,
        pullUtcDate,
        thingTid: updatedThing.thingTid,
        claimedAt: new Date(),
      });
    }

    return {
      thing: updatedThing,
      remainingAfterClaim: unclaimedRows.length - 1,
    };
  });

  await finalizeCollectionItemDelivery({
    thing: claimed.thing,
    creatorDid: collection.creatorDid,
    recipientDid: params.claimerDid,
    recipientHandle: claimer.handle,
  });

  return {
    thingTid: claimed.thing.thingTid,
    catalogNumber: claimed.thing.catalogNumber,
    name: claimed.thing.name,
    category: claimed.thing.category,
    subcategory: claimed.thing.subcategory,
    description: claimed.thing.description,
    flavorText: claimed.thing.flavorText,
    uselessTrait: claimed.thing.uselessTrait,
    iconUrl: claimed.thing.iconUrl,
    iconAlt: claimed.thing.iconAlt,
    remainingCount: claimed.remainingAfterClaim,
    nextPullUtcIso: getNextUtcMidnightIso(),
    unlimitedPulls: unlimited,
  };
}

/**
 * Allows a Thing's creator (`createdByDid`) to permanently revoke and destroy
 * a Thing at any time (either from the Maker Studio / Inspector UI, or automatically
 * when Jetstream observes the creator deleting `com.giveathing.thing/<thingTid>` in their PDS).
 */
export async function revokeAndDestroyCreatedThing(params: {
  thingTid: string;
  actorDid: string;
  skipCreatorPdsDelete?: boolean;
}): Promise<{ destroyed: true; thingTid: string; name: string }> {
  const db = getDb();

  const [thingRow] = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.thingTid, params.thingTid))
    .limit(1);

  if (!thingRow) {
    throw new Error("Thing not found (it may have already been destroyed).");
  }

  const effectiveCreatorDid = thingRow.createdByDid ?? thingRow.discovererDid;
  if (effectiveCreatorDid !== params.actorDid) {
    throw new Error("Only the creator of this thing can revoke and destroy it.");
  }

  await releaseExpiredCollectionReservations();

  if (thingRow.status === "reserved" && !params.skipCreatorPdsDelete) {
    throw new Error(
      "This thing is currently reserved in an active buyer checkout. Try again in a few minutes if checkout is cancelled."
    );
  }

  // 1. Delete genesis `com.giveathing.thing/<thingTid>` from the creator's PDS
  if (!params.skipCreatorPdsDelete) {
    const creatorAgent = await resolveCreatorPdsAgent(params.actorDid);
    if (creatorAgent) {
      try {
        await creatorAgent.com.atproto.repo.deleteRecord({
          repo: params.actorDid,
          collection: LEXICON_NSIDS.THING,
          rkey: params.thingTid,
        });
      } catch (err) {
        console.warn("[maker-revoke] Creator PDS deleteRecord warning:", err);
      }
    }
  }

  // 2. If claimed/held/escrowed, remove holding, favorite, and open offers from current holder's PDS
  if (thingRow.status === "held" || thingRow.status === "escrowed") {
    const openOffers = await db
      .select()
      .from(schema.escrowOffers)
      .where(
        and(
          eq(schema.escrowOffers.thingTid, params.thingTid),
          eq(schema.escrowOffers.status, "open")
        )
      );

    for (const offer of openOffers) {
      await deleteUserOfferOnPds(offer.senderDid, offer.offerTid);
    }

    await deleteUserFavoriteOnPds(
      thingRow.currentOwnerDid,
      params.thingTid,
      true
    );
    await deleteUserHoldingOnPds(thingRow.currentOwnerDid, params.thingTid);
  }

  // 3. Remove from PostgreSQL so it vanishes from inventories, feeds, and catalog
  await db
    .delete(schema.feedEvents)
    .where(eq(schema.feedEvents.thingTid, params.thingTid));
  await db
    .delete(schema.escrowOffers)
    .where(eq(schema.escrowOffers.thingTid, params.thingTid));
  await db
    .delete(schema.userFavoriteThings)
    .where(eq(schema.userFavoriteThings.thingTid, params.thingTid));
  await db
    .delete(schema.provenanceEntries)
    .where(eq(schema.provenanceEntries.thingTid, params.thingTid));
  await db
    .delete(schema.things)
    .where(eq(schema.things.thingTid, params.thingTid));

  return {
    destroyed: true,
    thingTid: params.thingTid,
    name: thingRow.name,
  };
}

export interface CreatorStudioCollectionSummary {
  collectionTid: string;
  name: string;
  description: string | null;
  totalItems: number;
  priceCents: number;
  platformFeeBps: number;
  unclaimedCount: number;
  claimedCount: number;
  createdAtIso: string;
  items: Array<{
    thingTid: string;
    catalogNumber: number;
    name: string;
    subcategory: string;
    uselessTrait: string;
    iconUrl: string;
    iconAlt: string;
    status: string;
    currentOwnerHandle: string;
  }>;
}

export async function listCreatorCollectionsForStudio(
  creatorDid: string
): Promise<CreatorStudioCollectionSummary[]> {
  await releaseExpiredCollectionReservations();
  const db = getDb();
  const cols = await db
    .select()
    .from(schema.thingCollections)
    .where(eq(schema.thingCollections.creatorDid, creatorDid))
    .orderBy(desc(schema.thingCollections.createdAt));

  if (cols.length === 0) return [];

  const colTids = cols.map((c) => c.collectionTid);
  const thingRows = await db
    .select()
    .from(schema.things)
    .where(inArray(schema.things.collectionId, colTids))
    .orderBy(asc(schema.things.catalogNumber));

  const ownerDids = Array.from(
    new Set(thingRows.map((t) => t.currentOwnerDid))
  );
  const ownerRows =
    ownerDids.length > 0
      ? await db
          .select({ did: schema.users.did, handle: schema.users.handle })
          .from(schema.users)
          .where(inArray(schema.users.did, ownerDids))
      : [];
  const handleByDid = new Map(ownerRows.map((u) => [u.did, u.handle]));

  return cols.map((c) => {
    const cItems = thingRows.filter((t) => t.collectionId === c.collectionTid);
    const unclaimedCount = cItems.filter(
      (t) => t.status === "unclaimed"
    ).length;
    const claimedCount = cItems.filter(
      (t) => t.status === "held" || t.status === "escrowed"
    ).length;
    return {
      collectionTid: c.collectionTid,
      name: c.name,
      description: c.description,
      totalItems: c.totalItems,
      priceCents: c.priceCents,
      platformFeeBps: c.platformFeeBps,
      unclaimedCount,
      claimedCount,
      createdAtIso: c.createdAt.toISOString(),
      items: cItems.map((t) => ({
        thingTid: t.thingTid,
        catalogNumber: t.catalogNumber,
        name: t.name,
        subcategory: t.subcategory,
        uselessTrait: t.uselessTrait,
        iconUrl: t.iconUrl,
        iconAlt: t.iconAlt,
        status: t.status,
        currentOwnerHandle:
          handleByDid.get(t.currentOwnerDid) ?? t.currentOwnerDid,
      })),
    };
  });
}
