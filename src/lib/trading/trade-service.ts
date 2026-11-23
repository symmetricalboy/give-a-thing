import { and, asc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/db";
import { getPublicAppUrl } from "@/lib/atproto/oauth";
import { appendLedgerEntryOnAppPds } from "@/lib/atproto/app-pds";
import { resolveActorProfile } from "@/lib/atproto/public-bsky";
import {
  deleteUserHoldingOnPds,
  deleteUserOfferOnPds,
  putUserHoldingOnPds,
  writeUserClaimOnPds,
  writeUserOfferOnPds,
  writeUserTransferOnPds,
} from "@/lib/atproto/user-pds";
import { broadcastFeedEvent } from "@/lib/feed/bus";
import {
  nextTid,
  type ProvenanceHop,
  type ProvenanceVia,
  type StrongRef,
} from "@/lib/lexicons";
import { removeFavoriteOnTransfer } from "@/lib/social/favorites";

export const ESCROW_REVOKE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function sanitizeGiftNote(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return Array.from(trimmed).slice(0, 140).join("");
}

export function isOfferRevocableNow(
  revocableAfter: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() >= revocableAfter.getTime();
}

export function buildBlueskyComposerIntentUrl(params: {
  recipientHandle: string;
  thingName: string;
  catalogNumber: number;
  claimUrl: string;
  note?: string;
}): string {
  const cleanHandle = params.recipientHandle.replace(/^@/, "");
  const noteSnippet = params.note ? ` "${params.note}"` : "";
  const text = `Hey @${cleanHandle}! I set aside a completely pointless thing for you on Give a Thing: #${String(params.catalogNumber).padStart(4, "0")} ${params.thingName}.${noteSnippet}\n\nClaim your thing before 24h: ${params.claimUrl}`;
  const intent = new URL("https://bsky.app/intent/compose");
  intent.searchParams.set("text", text);
  return intent.toString();
}

async function getSprite512BufferFromBase64(
  spriteBase64: string | null
): Promise<Buffer | undefined> {
  if (!spriteBase64) return undefined;
  const buf = Buffer.from(spriteBase64, "base64");
  const meta = await sharp(buf).metadata();
  if (meta.width === 512 && meta.height === 512) {
    return buf;
  }
  return await sharp(buf)
    .resize(512, 512, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, palette: true, colors: 48 })
    .toBuffer();
}

async function loadProvenanceHops(thingTid: string): Promise<ProvenanceHop[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.provenanceEntries)
    .where(eq(schema.provenanceEntries.thingTid, thingTid))
    .orderBy(asc(schema.provenanceEntries.sequenceNum));

  return rows.map((r) => ({
    sequenceNum: r.sequenceNum,
    owner: r.toDid,
    handleSnapshot: r.toHandleSnapshot,
    via: r.via as ProvenanceVia,
    ...(r.note ? { note: r.note } : {}),
    occurredAt: r.occurredAt.toISOString(),
  }));
}

export async function giveThingDirectly(params: {
  senderDid: string;
  thingTid: string;
  recipientDid: string;
  note?: string | null;
}) {
  if (params.senderDid === params.recipientDid) {
    throw new Error("You cannot give a thing to yourself—find a friend!");
  }

  const note = sanitizeGiftNote(params.note);
  const db = getDb();

  const [thingRow] = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.thingTid, params.thingTid))
    .limit(1);

  if (!thingRow) {
    throw new Error("Thing not found.");
  }
  if (thingRow.currentOwnerDid !== params.senderDid) {
    throw new Error("You do not currently own this thing.");
  }
  if (thingRow.status !== "held") {
    throw new Error(
      "This thing is currently set aside in an escrow offer. Revoke the expired offer first to give it to someone else."
    );
  }

  const [sender, recipient] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, params.senderDid))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, params.recipientDid))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!sender) {
    throw new Error("Sender account not found.");
  }
  if (!recipient) {
    throw new Error(
      "Recipient has not joined Give a Thing yet—use the 'Set Aside & Invite on Bluesky' option instead!"
    );
  }

  const priorHops = await loadProvenanceHops(params.thingTid);
  const nextSeq =
    priorHops.length > 0
      ? priorHops[priorHops.length - 1]!.sequenceNum + 1
      : thingRow.transferCount + 1;

  const now = new Date();
  const nowIso = now.toISOString();
  const transferTid = nextTid();
  const entryTid = nextTid();

  const canonicalThingRef: StrongRef = {
    uri:
      thingRow.canonicalAtUri ??
      `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || thingRow.discovererDid}/com.giveathing.thing/${thingRow.thingTid}`,
    cid: thingRow.canonicalAtCid ?? `bafkrei${thingRow.thingTid}`,
  };

  const prevLedgerRef: StrongRef | undefined =
    thingRow.latestLedgerAtUri && thingRow.latestLedgerAtCid
      ? { uri: thingRow.latestLedgerAtUri, cid: thingRow.latestLedgerAtCid }
      : undefined;

  // 1. Sender signs transfer record & removes holding on Sender's PDS
  const transferRef = await writeUserTransferOnPds({
    senderDid: params.senderDid,
    transferTid,
    thingRef: canonicalThingRef,
    toDid: params.recipientDid,
    note,
    transferredAtIso: nowIso,
  });

  await deleteUserHoldingOnPds(params.senderDid, params.thingTid);

  // 2. App PDS appends immutable provenance hop
  let ledgerRef: StrongRef | null = null;
  try {
    ledgerRef = await appendLedgerEntryOnAppPds({
      entryTid,
      thingRef: canonicalThingRef,
      prevEntryRef: prevLedgerRef,
      sequenceNum: nextSeq,
      ownerDid: params.recipientDid,
      previousOwnerDid: params.senderDid,
      via: "direct_gift",
      note,
      userProofRef: transferRef ?? undefined,
      occurredAtIso: nowIso,
    });
  } catch (err) {
    console.warn("[trade] App PDS ledger append warning:", err);
  }

  // 3. Recipient PDS receives holding + sprite blob (or queues in pending_pds_syncs if offline)
  const updatedProvenance: ProvenanceHop[] = [
    ...priorHops,
    {
      sequenceNum: nextSeq,
      owner: params.recipientDid,
      handleSnapshot: recipient.handle,
      via: "direct_gift",
      ...(note ? { note } : {}),
      occurredAt: nowIso,
    },
  ];

  const sprite512 = await getSprite512BufferFromBase64(thingRow.spritePngBase64);
  const newHoldingRef = await putUserHoldingOnPds({
    ownerDid: params.recipientDid,
    thingTid: thingRow.thingTid,
    thingRef: canonicalThingRef,
    catalogNumber: thingRow.catalogNumber,
    name: thingRow.name,
    category: thingRow.category,
    description: thingRow.description,
    iconPngBuffer: sprite512,
    status: "held",
    acquiredAtIso: nowIso,
    provenance: updatedProvenance,
  });

  // 4. Remove from sender's Top 8 favorites & commit ownership in PostgreSQL
  await removeFavoriteOnTransfer(params.senderDid, params.thingTid);

  await db
    .update(schema.things)
    .set({
      currentOwnerDid: params.recipientDid,
      status: "held",
      transferCount: sql`${schema.things.transferCount} + 1`,
      latestLedgerAtUri: ledgerRef?.uri ?? thingRow.latestLedgerAtUri,
      latestLedgerAtCid: ledgerRef?.cid ?? thingRow.latestLedgerAtCid,
      currentHoldingAtUri: newHoldingRef?.uri ?? null,
    })
    .where(
      and(
        eq(schema.things.thingTid, params.thingTid),
        eq(schema.things.currentOwnerDid, params.senderDid)
      )
    );

  await db.insert(schema.provenanceEntries).values({
    entryTid,
    thingTid: params.thingTid,
    sequenceNum: nextSeq,
    fromDid: params.senderDid,
    fromHandleSnapshot: sender.handle,
    toDid: params.recipientDid,
    toHandleSnapshot: recipient.handle,
    via: "direct_gift",
    note: note ?? null,
    ledgerAtUri: ledgerRef?.uri ?? null,
    ledgerAtCid: ledgerRef?.cid ?? null,
    userProofAtUri: transferRef?.uri ?? null,
    userProofAtCid: transferRef?.cid ?? null,
    occurredAt: now,
  });

  const [feedRow] = await db
    .insert(schema.feedEvents)
    .values({
      eventType: "direct_gift",
      actorDid: params.senderDid,
      targetDid: params.recipientDid,
      thingTid: params.thingTid,
      sequenceNum: nextSeq,
      note: note ?? null,
      createdAt: now,
    })
    .returning();

  if (feedRow) {
    broadcastFeedEvent({
      id: feedRow.id,
      eventType: "direct_gift",
      actorDid: params.senderDid,
      targetDid: params.recipientDid,
      thingTid: params.thingTid,
      createdAt: nowIso,
    });
  }

  return {
    thingTid: params.thingTid,
    sequenceNum: nextSeq,
    recipientHandle: recipient.handle,
    transferAtUri: transferRef?.uri ?? null,
    ledgerAtUri: ledgerRef?.uri ?? null,
  };
}

export async function createEscrowOffer(params: {
  senderDid: string;
  thingTid: string;
  recipientActor: string;
  note?: string | null;
}) {
  const note = sanitizeGiftNote(params.note);
  const db = getDb();

  const resolved = await resolveActorProfile(params.recipientActor);
  if (!resolved) {
    throw new Error(
      `Could not find Bluesky account "${params.recipientActor}". Double-check their handle!`
    );
  }

  if (resolved.did === params.senderDid) {
    throw new Error("You cannot set aside a thing for yourself!");
  }

  // Check if recipient actually already joined Give a Thing!
  const existingRecipient = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, resolved.did))
    .limit(1);

  if (existingRecipient[0]) {
    const direct = await giveThingDirectly({
      senderDid: params.senderDid,
      thingTid: params.thingTid,
      recipientDid: resolved.did,
      note,
    });
    return {
      mode: "direct_gift" as const,
      ...direct,
    };
  }

  const [thingRow] = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.thingTid, params.thingTid))
    .limit(1);

  if (!thingRow) {
    throw new Error("Thing not found.");
  }
  if (thingRow.currentOwnerDid !== params.senderDid) {
    throw new Error("You do not currently own this thing.");
  }
  if (thingRow.status !== "held") {
    throw new Error("This thing is already set aside in an active escrow offer.");
  }

  const offerTid = nextTid();
  const createdAt = new Date();
  const revocableAfter = new Date(createdAt.getTime() + ESCROW_REVOKE_WINDOW_MS);

  const canonicalThingRef: StrongRef = {
    uri:
      thingRow.canonicalAtUri ??
      `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || thingRow.discovererDid}/com.giveathing.thing/${thingRow.thingTid}`,
    cid: thingRow.canonicalAtCid ?? `bafkrei${thingRow.thingTid}`,
  };

  const offerRef = await writeUserOfferOnPds({
    senderDid: params.senderDid,
    offerTid,
    thingRef: canonicalThingRef,
    recipientDid: resolved.did,
    note,
    createdAtIso: createdAt.toISOString(),
    revocableAfterIso: revocableAfter.toISOString(),
  });

  const priorHops = await loadProvenanceHops(params.thingTid);
  const sprite512 = await getSprite512BufferFromBase64(thingRow.spritePngBase64);
  await putUserHoldingOnPds({
    ownerDid: params.senderDid,
    thingTid: thingRow.thingTid,
    thingRef: canonicalThingRef,
    catalogNumber: thingRow.catalogNumber,
    name: thingRow.name,
    category: thingRow.category,
    description: thingRow.description,
    iconPngBuffer: sprite512,
    status: "escrowed",
    acquiredAtIso:
      priorHops[priorHops.length - 1]?.occurredAt ?? thingRow.createdAt.toISOString(),
    provenance: priorHops,
  });

  await db.insert(schema.escrowOffers).values({
    offerTid,
    thingTid: params.thingTid,
    senderDid: params.senderDid,
    recipientDid: resolved.did,
    recipientHandleSnapshot: resolved.handle,
    recipientDisplayName: resolved.displayName ?? null,
    recipientAvatarUrl: resolved.avatar ?? null,
    note: note ?? null,
    status: "open",
    offerAtUri: offerRef?.uri ?? null,
    offerAtCid: offerRef?.cid ?? null,
    createdAt,
    revocableAfter,
  });

  await db
    .update(schema.things)
    .set({ status: "escrowed" })
    .where(eq(schema.things.thingTid, params.thingTid));

  const appUrl = getPublicAppUrl();
  const claimUrl = `${appUrl}/claim/${offerTid}`;
  const composerIntentUrl = buildBlueskyComposerIntentUrl({
    recipientHandle: resolved.handle,
    thingName: thingRow.name,
    catalogNumber: thingRow.catalogNumber,
    claimUrl,
    note,
  });

  return {
    mode: "escrow_offer" as const,
    offerTid,
    claimUrl,
    composerIntentUrl,
    recipientDid: resolved.did,
    recipientHandle: resolved.handle,
    revocableAfterIso: revocableAfter.toISOString(),
  };
}

export async function claimEscrowOffer(params: {
  claimerDid: string;
  offerTid: string;
}) {
  const db = getDb();

  const [offer] = await db
    .select()
    .from(schema.escrowOffers)
    .where(eq(schema.escrowOffers.offerTid, params.offerTid))
    .limit(1);

  if (!offer) {
    throw new Error("Gift offer not found.");
  }
  if (offer.status === "claimed") {
    throw new Error("This thing has already been claimed!");
  }
  if (offer.status === "revoked") {
    throw new Error(
      "This gift offer went unclaimed for over 24 hours and was reclaimed by the sender."
    );
  }
  if (offer.recipientDid !== params.claimerDid) {
    throw new Error(
      `This thing was set aside specifically for @${offer.recipientHandleSnapshot}. Sign in with that Bluesky account to claim it!`
    );
  }

  const [thingRow, sender, claimer] = await Promise.all([
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
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, params.claimerDid))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!thingRow || !sender || !claimer) {
    throw new Error("Could not load thing or player details for claim.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const claimTid = nextTid();
  const transferTid = nextTid();
  const entryTid = nextTid();

  const canonicalThingRef: StrongRef = {
    uri:
      thingRow.canonicalAtUri ??
      `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || thingRow.discovererDid}/com.giveathing.thing/${thingRow.thingTid}`,
    cid: thingRow.canonicalAtCid ?? `bafkrei${thingRow.thingTid}`,
  };

  const offerRef: StrongRef = {
    uri:
      offer.offerAtUri ??
      `at://${offer.senderDid}/com.giveathing.offer/${offer.offerTid}`,
    cid: offer.offerAtCid ?? `bafkrei${offer.offerTid}`,
  };

  const claimRef = await writeUserClaimOnPds({
    recipientDid: params.claimerDid,
    claimTid,
    offerRef,
    thingRef: canonicalThingRef,
    claimedAtIso: nowIso,
  });

  await writeUserTransferOnPds({
    senderDid: offer.senderDid,
    transferTid,
    thingRef: canonicalThingRef,
    toDid: params.claimerDid,
    note: offer.note ?? undefined,
    transferredAtIso: nowIso,
  });
  await deleteUserOfferOnPds(offer.senderDid, offer.offerTid);
  await deleteUserHoldingOnPds(offer.senderDid, offer.thingTid);

  const priorHops = await loadProvenanceHops(offer.thingTid);
  const nextSeq =
    priorHops.length > 0
      ? priorHops[priorHops.length - 1]!.sequenceNum + 1
      : thingRow.transferCount + 1;

  const prevLedgerRef: StrongRef | undefined =
    thingRow.latestLedgerAtUri && thingRow.latestLedgerAtCid
      ? { uri: thingRow.latestLedgerAtUri, cid: thingRow.latestLedgerAtCid }
      : undefined;

  let ledgerRef: StrongRef | null = null;
  try {
    ledgerRef = await appendLedgerEntryOnAppPds({
      entryTid,
      thingRef: canonicalThingRef,
      prevEntryRef: prevLedgerRef,
      sequenceNum: nextSeq,
      ownerDid: params.claimerDid,
      previousOwnerDid: offer.senderDid,
      via: "escrow_claim",
      note: offer.note ?? undefined,
      userProofRef: claimRef ?? undefined,
      occurredAtIso: nowIso,
    });
  } catch (err) {
    console.warn("[trade] App PDS escrow ledger warning:", err);
  }

  const updatedProvenance: ProvenanceHop[] = [
    ...priorHops,
    {
      sequenceNum: nextSeq,
      owner: params.claimerDid,
      handleSnapshot: claimer.handle,
      via: "escrow_claim",
      ...(offer.note ? { note: offer.note } : {}),
      occurredAt: nowIso,
    },
  ];

  const sprite512 = await getSprite512BufferFromBase64(thingRow.spritePngBase64);
  const holdingRef = await putUserHoldingOnPds({
    ownerDid: params.claimerDid,
    thingTid: thingRow.thingTid,
    thingRef: canonicalThingRef,
    catalogNumber: thingRow.catalogNumber,
    name: thingRow.name,
    category: thingRow.category,
    description: thingRow.description,
    iconPngBuffer: sprite512,
    status: "held",
    acquiredAtIso: nowIso,
    provenance: updatedProvenance,
  });

  await removeFavoriteOnTransfer(offer.senderDid, offer.thingTid);

  await db
    .update(schema.escrowOffers)
    .set({
      status: "claimed",
      claimAtUri: claimRef?.uri ?? null,
      resolvedAt: now,
    })
    .where(eq(schema.escrowOffers.offerTid, params.offerTid));

  await db
    .update(schema.things)
    .set({
      currentOwnerDid: params.claimerDid,
      status: "held",
      transferCount: sql`${schema.things.transferCount} + 1`,
      latestLedgerAtUri: ledgerRef?.uri ?? thingRow.latestLedgerAtUri,
      latestLedgerAtCid: ledgerRef?.cid ?? thingRow.latestLedgerAtCid,
      currentHoldingAtUri: holdingRef?.uri ?? null,
    })
    .where(eq(schema.things.thingTid, offer.thingTid));

  await db.insert(schema.provenanceEntries).values({
    entryTid,
    thingTid: offer.thingTid,
    sequenceNum: nextSeq,
    fromDid: offer.senderDid,
    fromHandleSnapshot: sender.handle,
    toDid: params.claimerDid,
    toHandleSnapshot: claimer.handle,
    via: "escrow_claim",
    note: offer.note,
    ledgerAtUri: ledgerRef?.uri ?? null,
    ledgerAtCid: ledgerRef?.cid ?? null,
    userProofAtUri: claimRef?.uri ?? null,
    userProofAtCid: claimRef?.cid ?? null,
    occurredAt: now,
  });

  const [feedRow] = await db
    .insert(schema.feedEvents)
    .values({
      eventType: "escrow_claim",
      actorDid: params.claimerDid,
      targetDid: offer.senderDid,
      thingTid: offer.thingTid,
      sequenceNum: nextSeq,
      note: offer.note,
      createdAt: now,
    })
    .returning();

  if (feedRow) {
    broadcastFeedEvent({
      id: feedRow.id,
      eventType: "escrow_claim",
      actorDid: params.claimerDid,
      targetDid: offer.senderDid,
      thingTid: offer.thingTid,
      createdAt: nowIso,
    });
  }

  return {
    thingTid: offer.thingTid,
    catalogNumber: thingRow.catalogNumber,
    name: thingRow.name,
    sequenceNum: nextSeq,
  };
}

export async function revokeEscrowOffer(params: {
  senderDid: string;
  offerTid: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const db = getDb();

  const [offer] = await db
    .select()
    .from(schema.escrowOffers)
    .where(eq(schema.escrowOffers.offerTid, params.offerTid))
    .limit(1);

  if (!offer) {
    throw new Error("Escrow offer not found.");
  }
  if (offer.senderDid !== params.senderDid) {
    throw new Error("Only the sender can revoke this offer.");
  }
  if (offer.status !== "open") {
    throw new Error(`Offer is already ${offer.status}.`);
  }

  if (!isOfferRevocableNow(offer.revocableAfter, now)) {
    const remainingMs = offer.revocableAfter.getTime() - now.getTime();
    const hours = Math.floor(remainingMs / 3_600_000);
    const mins = Math.ceil((remainingMs % 3_600_000) / 60_000);
    throw new Error(
      `Offer cannot be revoked yet—@${offer.recipientHandleSnapshot} still has ${hours}h ${mins}m left in their 24-hour claim window!`
    );
  }

  const [thingRow] = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.thingTid, offer.thingTid))
    .limit(1);

  await deleteUserOfferOnPds(params.senderDid, offer.offerTid);

  if (thingRow) {
    const canonicalThingRef: StrongRef = {
      uri:
        thingRow.canonicalAtUri ??
        `at://${process.env.NEXT_PUBLIC_APP_ATPROTO_DID || thingRow.discovererDid}/com.giveathing.thing/${thingRow.thingTid}`,
      cid: thingRow.canonicalAtCid ?? `bafkrei${thingRow.thingTid}`,
    };
    const priorHops = await loadProvenanceHops(offer.thingTid);
    const sprite512 = await getSprite512BufferFromBase64(
      thingRow.spritePngBase64
    );
    await putUserHoldingOnPds({
      ownerDid: params.senderDid,
      thingTid: thingRow.thingTid,
      thingRef: canonicalThingRef,
      catalogNumber: thingRow.catalogNumber,
      name: thingRow.name,
      category: thingRow.category,
      description: thingRow.description,
      iconPngBuffer: sprite512,
      status: "held",
      acquiredAtIso:
        priorHops[priorHops.length - 1]?.occurredAt ??
        thingRow.createdAt.toISOString(),
      provenance: priorHops,
    });
  }

  await db
    .update(schema.escrowOffers)
    .set({ status: "revoked", resolvedAt: now })
    .where(eq(schema.escrowOffers.offerTid, params.offerTid));

  await db
    .update(schema.things)
    .set({ status: "held" })
    .where(eq(schema.things.thingTid, offer.thingTid));

  return { revoked: true, thingTid: offer.thingTid };
}
