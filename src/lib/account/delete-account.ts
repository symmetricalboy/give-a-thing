import { asc, eq, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/db";
import {
  appendLedgerEntryOnAppPds,
  getAppPdsAgent,
} from "@/lib/atproto/app-pds";
import { getOAuthClient } from "@/lib/atproto/oauth";
import { getUserAgent, putUserHoldingOnPds } from "@/lib/atproto/user-pds";
import {
  isUnlimitedPullAccount,
  UNLIMITED_PULL_HANDLE,
} from "@/lib/generator/pull-service";
import {
  LEXICON_NSIDS,
  nextTid,
  type ProvenanceHop,
  type StrongRef,
} from "@/lib/lexicons";

export const USER_GIVEATHING_COLLECTIONS = [
  LEXICON_NSIDS.HOLDING,
  LEXICON_NSIDS.FAVORITE,
  LEXICON_NSIDS.TRANSFER,
  LEXICON_NSIDS.OFFER,
  LEXICON_NSIDS.CLAIM,
  LEXICON_NSIDS.FOLLOW,
] as const;

export interface DeleteAccountResult {
  deletedPdsRecords: number;
  returnedThings: number;
}

async function resolveHouseAccount() {
  const db = getDb();
  const [byHandle] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.handle}) = ${UNLIMITED_PULL_HANDLE}`)
    .limit(1);
  if (byHandle) return byHandle;

  const configuredDid = process.env.NEXT_PUBLIC_APP_ATPROTO_DID?.trim();
  if (configuredDid && !configuredDid.includes("replace_with")) {
    const [byDid] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, configuredDid))
      .limit(1);
    if (byDid) return byDid;
  }

  const appAgent = await getAppPdsAgent();
  if (appAgent?.session?.did) {
    const inserted = await db
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
    return inserted[0] ?? null;
  }

  return null;
}

/**
 * Permanently deletes all `com.giveathing.*` records from `userDid`'s own ATmosphere PDS,
 * returns any held Things back into `@giveathing.com` circulation so nothing is orphaned
 * (and Jetstream never attempts to restore deleted holdings), revokes OAuth tokens, and
 * removes the player's account data from PostgreSQL.
 */
export async function permanentlyDeleteUserAccount(
  userDid: string,
  sessionHandle?: string | null
): Promise<DeleteAccountResult> {
  const db = getDb();

  const [userRow] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, userDid))
    .limit(1);

  if (
    isUnlimitedPullAccount({
      did: userDid,
      handle: userRow?.handle ?? sessionHandle ?? null,
    })
  ) {
    throw new Error(
      "The official @giveathing.com catalog account cannot be deleted."
    );
  }

  // Step 0: Verify active OAuth session so we can wipe records on the user's PDS first
  const userAgent = await getUserAgent(userDid);
  if (!userAgent) {
    throw new Error(
      "Your ATmosphere session has expired. Please log out, click LOGIN again to refresh authorization, and then run delete so we can wipe the records from your Personal Data Server."
    );
  }

  // Step 1: Reassign any currently held Things & clear FKs BEFORE deleting PDS holdings
  // so Jetstream's Indestructible Thing Guard sees `currentOwnerDid !== userDid`.
  const houseUser = await resolveHouseAccount();

  await db
    .delete(schema.escrowOffers)
    .where(eq(schema.escrowOffers.senderDid, userDid));

  const heldThings = await db
    .select()
    .from(schema.things)
    .where(eq(schema.things.currentOwnerDid, userDid));

  let returnedThings = 0;

  if (houseUser && houseUser.did !== userDid) {
    for (const thingRow of heldThings) {
      const ledgerRows = await db
        .select()
        .from(schema.provenanceEntries)
        .where(eq(schema.provenanceEntries.thingTid, thingRow.thingTid))
        .orderBy(asc(schema.provenanceEntries.sequenceNum));

      const priorHops: ProvenanceHop[] = ledgerRows.map((r) => ({
        sequenceNum: r.sequenceNum,
        owner: r.toDid,
        handleSnapshot: r.toHandleSnapshot,
        via: r.via as "daily_pull" | "direct_gift" | "escrow_claim",
        ...(r.note ? { note: r.note } : {}),
        occurredAt: r.occurredAt.toISOString(),
      }));

      const nextSeq =
        priorHops.length > 0
          ? priorHops[priorHops.length - 1]!.sequenceNum + 1
          : thingRow.transferCount + 1;
      const now = new Date();
      const nowIso = now.toISOString();
      const entryTid = nextTid();

      const canonicalThingRef: StrongRef = {
        uri:
          thingRow.canonicalAtUri ??
          `at://${houseUser.did}/com.giveathing.thing/${thingRow.thingTid}`,
        cid: thingRow.canonicalAtCid ?? `bafkrei${thingRow.thingTid}`,
      };

      const prevLedgerRef: StrongRef | undefined =
        thingRow.latestLedgerAtUri && thingRow.latestLedgerAtCid
          ? {
              uri: thingRow.latestLedgerAtUri,
              cid: thingRow.latestLedgerAtCid,
            }
          : undefined;

      let ledgerRef: StrongRef | null = null;
      try {
        ledgerRef = await appendLedgerEntryOnAppPds({
          entryTid,
          thingRef: canonicalThingRef,
          prevEntryRef: prevLedgerRef,
          sequenceNum: nextSeq,
          ownerDid: houseUser.did,
          previousOwnerDid: userDid,
          via: "direct_gift",
          occurredAtIso: nowIso,
        });
      } catch (err) {
        console.warn("[account-delete] App PDS return ledger warning:", err);
      }

      let sprite512: Buffer | undefined;
      if (thingRow.spritePngBase64) {
        try {
          sprite512 = await sharp(
            Buffer.from(thingRow.spritePngBase64, "base64")
          )
            .resize(512, 512, { kernel: sharp.kernel.nearest })
            .png({ compressionLevel: 9, palette: true, colors: 48 })
            .toBuffer();
        } catch {
          sprite512 = undefined;
        }
      }

      const houseHoldingRef = await putUserHoldingOnPds({
        ownerDid: houseUser.did,
        thingTid: thingRow.thingTid,
        thingRef: canonicalThingRef,
        catalogNumber: thingRow.catalogNumber,
        name: thingRow.name,
        category: thingRow.category,
        description: thingRow.description,
        iconPngBuffer: sprite512,
        status: "held",
        acquiredAtIso: nowIso,
        provenance: [
          ...priorHops,
          {
            sequenceNum: nextSeq,
            owner: houseUser.did,
            handleSnapshot: houseUser.handle,
            via: "direct_gift",
            occurredAt: nowIso,
          },
        ],
      });

      await db
        .update(schema.things)
        .set({
          currentOwnerDid: houseUser.did,
          status: "held",
          transferCount: sql`${schema.things.transferCount} + 1`,
          latestLedgerAtUri: ledgerRef?.uri ?? thingRow.latestLedgerAtUri,
          latestLedgerAtCid: ledgerRef?.cid ?? thingRow.latestLedgerAtCid,
          currentHoldingAtUri: houseHoldingRef?.uri ?? null,
        })
        .where(eq(schema.things.thingTid, thingRow.thingTid));

      await db.insert(schema.provenanceEntries).values({
        entryTid,
        thingTid: thingRow.thingTid,
        sequenceNum: nextSeq,
        fromDid: userDid,
        fromHandleSnapshot: "deleted-account",
        toDid: houseUser.did,
        toHandleSnapshot: houseUser.handle,
        via: "direct_gift",
        note: null,
        ledgerAtUri: ledgerRef?.uri ?? null,
        ledgerAtCid: ledgerRef?.cid ?? null,
        occurredAt: now,
      });

      returnedThings++;
    }

    await db
      .update(schema.things)
      .set({ discovererDid: houseUser.did })
      .where(eq(schema.things.discovererDid, userDid));
  }

  // Step 2: Wipe all `com.giveathing.*` records from the user's own ATmosphere PDS
  let deletedPdsRecords = 0;

  for (const collection of USER_GIVEATHING_COLLECTIONS) {
    const rkeys: string[] = [];
    let cursor: string | undefined;

    do {
      const res = await userAgent.com.atproto.repo.listRecords({
        repo: userDid,
        collection,
        limit: 100,
        cursor,
      });
      const records = res.data.records ?? [];
      for (const rec of records) {
        const rkey = rec.uri.split("/").pop();
        if (rkey) rkeys.push(rkey);
      }
      cursor = res.data.cursor;
    } while (cursor);

    for (let i = 0; i < rkeys.length; i += 50) {
      const chunk = rkeys.slice(i, i + 50);
      try {
        await userAgent.com.atproto.repo.applyWrites({
          repo: userDid,
          writes: chunk.map((rkey) => ({
            $type: "com.atproto.repo.applyWrites#delete" as const,
            collection,
            rkey,
          })),
        });
        deletedPdsRecords += chunk.length;
      } catch {
        for (const rkey of chunk) {
          try {
            await userAgent.com.atproto.repo.deleteRecord({
              repo: userDid,
              collection,
              rkey,
            });
            deletedPdsRecords++;
          } catch (delErr) {
            console.warn(
              `[account-delete] Failed deleting ${collection}/${rkey}:`,
              delErr
            );
          }
        }
      }
    }
  }

  // Step 3: Scrub database records & revoke OAuth session
  await db
    .update(schema.provenanceEntries)
    .set({ fromHandleSnapshot: "deleted-account" })
    .where(eq(schema.provenanceEntries.fromDid, userDid));

  await db
    .update(schema.provenanceEntries)
    .set({ toHandleSnapshot: "deleted-account" })
    .where(eq(schema.provenanceEntries.toDid, userDid));

  await db
    .delete(schema.feedEvents)
    .where(
      or(
        eq(schema.feedEvents.actorDid, userDid),
        eq(schema.feedEvents.targetDid, userDid)
      )
    );

  await db
    .delete(schema.pendingPdsSyncs)
    .where(eq(schema.pendingPdsSyncs.targetDid, userDid));

  await db
    .delete(schema.dailyPullLocks)
    .where(eq(schema.dailyPullLocks.did, userDid));

  await db
    .delete(schema.userFavoriteThings)
    .where(eq(schema.userFavoriteThings.userDid, userDid));

  await db
    .delete(schema.follows)
    .where(
      or(
        eq(schema.follows.followerDid, userDid),
        eq(schema.follows.subjectDid, userDid)
      )
    );

  await db
    .delete(schema.bskyKnownFollows)
    .where(
      or(
        eq(schema.bskyKnownFollows.followerDid, userDid),
        eq(schema.bskyKnownFollows.targetDid, userDid)
      )
    );

  try {
    const oauthClient = await getOAuthClient();
    await oauthClient.revoke(userDid);
  } catch (err) {
    console.warn("[account-delete] OAuth revoke warning:", err);
  }

  await db
    .delete(schema.oauthSessions)
    .where(eq(schema.oauthSessions.did, userDid));

  if (houseUser && houseUser.did !== userDid) {
    await db.delete(schema.users).where(eq(schema.users.did, userDid));
  } else {
    try {
      await db.delete(schema.users).where(eq(schema.users.did, userDid));
    } catch {
      await db
        .update(schema.users)
        .set({
          handle: "deleted-account",
          displayName: null,
          avatarUrl: null,
          pdsUrl: null,
          autoImportBskyFollows: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, userDid));
    }
  }

  return {
    deletedPdsRecords,
    returnedThings,
  };
}
