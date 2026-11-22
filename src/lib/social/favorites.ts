import { and, asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/db";
import { putUserHoldingOnPds } from "@/lib/atproto/user-pds";
import type { ProvenanceHop, StrongRef } from "@/lib/lexicons";

export const MAX_TOP_THINGS = 8;

async function syncHoldingFavoriteSlotToPds(
  ownerDid: string,
  thingTid: string,
  favoriteSlot: number | null
): Promise<void> {
  const db = getDb();
  const [thingRow, ledgerRows] = await Promise.all([
    db
      .select()
      .from(schema.things)
      .where(eq(schema.things.thingTid, thingTid))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(schema.provenanceEntries)
      .where(eq(schema.provenanceEntries.thingTid, thingTid))
      .orderBy(asc(schema.provenanceEntries.sequenceNum)),
  ]);

  if (!thingRow || thingRow.currentOwnerDid !== ownerDid) return;

  const canonicalThingRef: StrongRef = {
    uri:
      thingRow.canonicalAtUri ??
      `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || thingRow.discovererDid}/com.giveathing.thing/${thingRow.thingTid}`,
    cid: thingRow.canonicalAtCid ?? `bafkrei${thingRow.thingTid}`,
  };

  let sprite512: Buffer | undefined;
  if (thingRow.spritePngBase64) {
    sprite512 = await sharp(Buffer.from(thingRow.spritePngBase64, "base64"))
      .resize(512, 512, { kernel: sharp.kernel.nearest })
      .png({ compressionLevel: 9, palette: true, colors: 48 })
      .toBuffer();
  }

  const provenance: ProvenanceHop[] = ledgerRows.map((r) => ({
    sequenceNum: r.sequenceNum,
    owner: r.toDid,
    handleSnapshot: r.toHandleSnapshot,
    via: r.via as "daily_pull" | "direct_gift" | "escrow_claim",
    ...(r.note ? { note: r.note } : {}),
    occurredAt: r.occurredAt.toISOString(),
  }));

  await putUserHoldingOnPds({
    ownerDid,
    thingTid: thingRow.thingTid,
    thingRef: canonicalThingRef,
    catalogNumber: thingRow.catalogNumber,
    name: thingRow.name,
    category: thingRow.category,
    description: thingRow.description,
    iconPngBuffer: sprite512,
    status: thingRow.status as "held" | "escrowed",
    favoriteSlot,
    acquiredAtIso:
      provenance[provenance.length - 1]?.occurredAt ??
      thingRow.createdAt.toISOString(),
    provenance,
  });
}

async function compactUserFavoriteSlots(userDid: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.userFavoriteThings)
    .where(eq(schema.userFavoriteThings.userDid, userDid))
    .orderBy(asc(schema.userFavoriteThings.slot));

  for (let idx = 0; idx < rows.length; idx++) {
    const expectedSlot = idx + 1;
    const row = rows[idx]!;
    if (row.slot !== expectedSlot) {
      await db
        .update(schema.userFavoriteThings)
        .set({ slot: expectedSlot })
        .where(
          and(
            eq(schema.userFavoriteThings.userDid, userDid),
            eq(schema.userFavoriteThings.thingTid, row.thingTid)
          )
        );
    }
  }
}

export async function toggleFavoriteThing(params: {
  userDid: string;
  thingTid: string;
}): Promise<{ favorited: boolean; slot: number | null }> {
  const db = getDb();

  const [thingRow] = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.thingTid, params.thingTid))
    .limit(1);

  if (!thingRow || thingRow.currentOwnerDid !== params.userDid) {
    throw new Error("You can only feature things you currently own.");
  }

  const currentFavs = await db
    .select()
    .from(schema.userFavoriteThings)
    .where(eq(schema.userFavoriteThings.userDid, params.userDid))
    .orderBy(asc(schema.userFavoriteThings.slot));

  const existing = currentFavs.find((f) => f.thingTid === params.thingTid);

  if (existing) {
    await db
      .delete(schema.userFavoriteThings)
      .where(
        and(
          eq(schema.userFavoriteThings.userDid, params.userDid),
          eq(schema.userFavoriteThings.thingTid, params.thingTid)
        )
      );
    await compactUserFavoriteSlots(params.userDid);
    void syncHoldingFavoriteSlotToPds(params.userDid, params.thingTid, null).catch(
      () => {}
    );
    return { favorited: false, slot: null };
  }

  if (currentFavs.length >= MAX_TOP_THINGS) {
    throw new Error(
      `Your Top ${MAX_TOP_THINGS} is full! Unfavorite one of your ${MAX_TOP_THINGS} featured things first.`
    );
  }

  const newSlot = currentFavs.length + 1;
  await db.insert(schema.userFavoriteThings).values({
    userDid: params.userDid,
    thingTid: params.thingTid,
    slot: newSlot,
  });

  void syncHoldingFavoriteSlotToPds(
    params.userDid,
    params.thingTid,
    newSlot
  ).catch(() => {});

  return { favorited: true, slot: newSlot };
}

export async function reorderFavoriteThing(params: {
  userDid: string;
  thingTid: string;
  direction: "left" | "right";
}): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.userFavoriteThings)
    .where(eq(schema.userFavoriteThings.userDid, params.userDid))
    .orderBy(asc(schema.userFavoriteThings.slot));

  const idx = rows.findIndex((r) => r.thingTid === params.thingTid);
  if (idx === -1) return;

  const swapIdx = params.direction === "left" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  const current = rows[idx]!;
  const neighbor = rows[swapIdx]!;

  await db
    .update(schema.userFavoriteThings)
    .set({ slot: neighbor.slot })
    .where(
      and(
        eq(schema.userFavoriteThings.userDid, params.userDid),
        eq(schema.userFavoriteThings.thingTid, current.thingTid)
      )
    );

  await db
    .update(schema.userFavoriteThings)
    .set({ slot: current.slot })
    .where(
      and(
        eq(schema.userFavoriteThings.userDid, params.userDid),
        eq(schema.userFavoriteThings.thingTid, neighbor.thingTid)
      )
    );
}

export async function removeFavoriteOnTransfer(
  formerOwnerDid: string,
  thingTid: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.userFavoriteThings)
    .where(
      and(
        eq(schema.userFavoriteThings.userDid, formerOwnerDid),
        eq(schema.userFavoriteThings.thingTid, thingTid)
      )
    );
  await compactUserFavoriteSlots(formerOwnerDid);
}
