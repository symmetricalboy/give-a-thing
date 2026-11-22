import { Agent } from "@atproto/api";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAppPdsAgent } from "./app-pds";
import { getOAuthClient } from "./oauth";
import {
  LEXICON_NSIDS,
  type ProvenanceHop,
  type StrongRef,
} from "@/lib/lexicons";

export async function getUserAgent(did: string): Promise<Agent | null> {
  try {
    const client = await getOAuthClient();
    const oauthSession = await client.restore(did);
    return new Agent(oauthSession);
  } catch {
    return null;
  }
}

export interface PutUserHoldingParams {
  ownerDid: string;
  thingTid: string;
  thingRef: StrongRef;
  catalogNumber: number;
  name: string;
  category: string;
  description: string;
  iconPngBuffer?: Buffer;
  status: "held" | "escrowed";
  favoriteSlot?: number | null;
  acquiredAtIso: string;
  provenance: ProvenanceHop[];
}

/**
 * Writes `com.giveathing.holding/<thingTid>` into the player's own PDS.
 * If the player's OAuth token expired while they were offline (e.g., receiving a direct gift),
 * queues a `pending_pds_syncs` entry so their PDS reconciles automatically on next sign-in.
 */
export async function putUserHoldingOnPds(
  params: PutUserHoldingParams,
  enqueueIfOffline = true
): Promise<StrongRef | null> {
  const userAgent = await getUserAgent(params.ownerDid);
  const appAgent = !userAgent ? await getAppPdsAgent() : null;
  const activeAgent =
    userAgent ??
    (appAgent?.session?.did === params.ownerDid ? appAgent : null);

  if (!activeAgent) {
    if (enqueueIfOffline) {
      await enqueuePendingPdsSync(
        params.ownerDid,
        "put_holding",
        params.thingTid,
        {
          thingTid: params.thingTid,
          thingRef: params.thingRef,
          catalogNumber: params.catalogNumber,
          name: params.name,
          category: params.category,
          description: params.description,
          status: params.status,
          favoriteSlot: params.favoriteSlot ?? null,
          acquiredAtIso: params.acquiredAtIso,
          provenance: params.provenance,
        }
      );
    }
    return null;
  }

  try {
    let iconBlob: unknown = undefined;
    if (params.iconPngBuffer) {
      const upload = await activeAgent.uploadBlob(params.iconPngBuffer, {
        encoding: "image/png",
      });
      iconBlob = upload.data.blob;
    }

    const res = await activeAgent.com.atproto.repo.putRecord({
      repo: params.ownerDid,
      collection: LEXICON_NSIDS.HOLDING,
      rkey: params.thingTid,
      record: {
        $type: LEXICON_NSIDS.HOLDING,
        thing: params.thingRef,
        catalogNumber: params.catalogNumber,
        name: params.name,
        category: params.category,
        description: params.description,
        ...(iconBlob ? { icon: iconBlob } : {}),
        status: params.status,
        ...(params.favoriteSlot ? { favoriteSlot: params.favoriteSlot } : {}),
        acquiredAt: params.acquiredAtIso,
        provenance: params.provenance,
      },
    });

    return { uri: res.data.uri, cid: res.data.cid };
  } catch (err) {
    if (enqueueIfOffline) {
      await enqueuePendingPdsSync(
        params.ownerDid,
        "put_holding",
        params.thingTid,
        {
          thingTid: params.thingTid,
          thingRef: params.thingRef,
          catalogNumber: params.catalogNumber,
          name: params.name,
          category: params.category,
          description: params.description,
          status: params.status,
          favoriteSlot: params.favoriteSlot ?? null,
          acquiredAtIso: params.acquiredAtIso,
          provenance: params.provenance,
        }
      );
    }
    console.warn("[user-pds] putUserHoldingOnPds deferred:", err);
    return null;
  }
}

export async function deleteUserHoldingOnPds(
  ownerDid: string,
  thingTid: string
): Promise<void> {
  const agent = await getUserAgent(ownerDid);
  if (!agent) {
    await enqueuePendingPdsSync(ownerDid, "delete_holding", thingTid, {
      thingTid,
    });
    return;
  }
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: ownerDid,
      collection: LEXICON_NSIDS.HOLDING,
      rkey: thingTid,
    });
  } catch (err) {
    console.warn("[user-pds] deleteUserHoldingOnPds warning:", err);
  }
}

export async function writeUserTransferOnPds(params: {
  senderDid: string;
  transferTid: string;
  thingRef: StrongRef;
  toDid: string;
  note?: string;
  transferredAtIso: string;
}): Promise<StrongRef | null> {
  const agent = await getUserAgent(params.senderDid);
  if (!agent) return null;
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: params.senderDid,
      collection: LEXICON_NSIDS.TRANSFER,
      rkey: params.transferTid,
      record: {
        $type: LEXICON_NSIDS.TRANSFER,
        thing: params.thingRef,
        to: params.toDid,
        ...(params.note ? { note: params.note } : {}),
        transferredAt: params.transferredAtIso,
      },
    });
    return { uri: res.data.uri, cid: res.data.cid };
  } catch (err) {
    console.warn("[user-pds] writeUserTransferOnPds warning:", err);
    return null;
  }
}

export async function writeUserOfferOnPds(params: {
  senderDid: string;
  offerTid: string;
  thingRef: StrongRef;
  recipientDid: string;
  note?: string;
  createdAtIso: string;
  revocableAfterIso: string;
}): Promise<StrongRef | null> {
  const agent = await getUserAgent(params.senderDid);
  if (!agent) return null;
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: params.senderDid,
      collection: LEXICON_NSIDS.OFFER,
      rkey: params.offerTid,
      record: {
        $type: LEXICON_NSIDS.OFFER,
        thing: params.thingRef,
        recipientDid: params.recipientDid,
        ...(params.note ? { note: params.note } : {}),
        createdAt: params.createdAtIso,
        revocableAfter: params.revocableAfterIso,
      },
    });
    return { uri: res.data.uri, cid: res.data.cid };
  } catch (err) {
    console.warn("[user-pds] writeUserOfferOnPds warning:", err);
    return null;
  }
}

export async function deleteUserOfferOnPds(
  senderDid: string,
  offerTid: string
): Promise<void> {
  const agent = await getUserAgent(senderDid);
  if (!agent) return;
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: senderDid,
      collection: LEXICON_NSIDS.OFFER,
      rkey: offerTid,
    });
  } catch (err) {
    console.warn("[user-pds] deleteUserOfferOnPds warning:", err);
  }
}

export async function writeUserClaimOnPds(params: {
  recipientDid: string;
  claimTid: string;
  offerRef: StrongRef;
  thingRef: StrongRef;
  claimedAtIso: string;
}): Promise<StrongRef | null> {
  const agent = await getUserAgent(params.recipientDid);
  if (!agent) return null;
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: params.recipientDid,
      collection: LEXICON_NSIDS.CLAIM,
      rkey: params.claimTid,
      record: {
        $type: LEXICON_NSIDS.CLAIM,
        offer: params.offerRef,
        thing: params.thingRef,
        claimedAt: params.claimedAtIso,
      },
    });
    return { uri: res.data.uri, cid: res.data.cid };
  } catch (err) {
    console.warn("[user-pds] writeUserClaimOnPds warning:", err);
    return null;
  }
}

export async function writeUserFollowOnPds(params: {
  followerDid: string;
  followTid: string;
  subjectDid: string;
  source: "manual" | "bsky_import" | "bsky_auto";
  createdAtIso: string;
}): Promise<string | null> {
  const agent = await getUserAgent(params.followerDid);
  if (!agent) return null;
  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: params.followerDid,
      collection: LEXICON_NSIDS.FOLLOW,
      rkey: params.followTid,
      record: {
        $type: LEXICON_NSIDS.FOLLOW,
        subject: params.subjectDid,
        source: params.source,
        createdAt: params.createdAtIso,
      },
    });
    return res.data.uri;
  } catch (err) {
    console.warn("[user-pds] writeUserFollowOnPds warning:", err);
    return null;
  }
}

export async function deleteUserFollowOnPds(
  followerDid: string,
  followTid: string
): Promise<void> {
  const agent = await getUserAgent(followerDid);
  if (!agent) return;
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: followerDid,
      collection: LEXICON_NSIDS.FOLLOW,
      rkey: followTid,
    });
  } catch (err) {
    console.warn("[user-pds] deleteUserFollowOnPds warning:", err);
  }
}

export interface PutUserFavoriteParams {
  userDid: string;
  thingTid: string;
  thingRef: StrongRef;
  slot: number;
  catalogNumber?: number;
  name?: string;
  createdAtIso: string;
}

/**
 * Publishes or updates `com.giveathing.favorite/<thingTid>` in the player's own PDS
 * for their profile Top 8 featured showcase.
 */
export async function putUserFavoriteOnPds(
  params: PutUserFavoriteParams,
  enqueueIfOffline = true
): Promise<StrongRef | null> {
  const agent = await getUserAgent(params.userDid);
  if (!agent) {
    if (enqueueIfOffline) {
      await enqueuePendingPdsSync(
        params.userDid,
        "put_favorite",
        params.thingTid,
        {
          thingTid: params.thingTid,
          thingRef: params.thingRef,
          slot: params.slot,
          catalogNumber: params.catalogNumber,
          name: params.name,
          createdAtIso: params.createdAtIso,
        }
      );
    }
    return null;
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: params.userDid,
      collection: LEXICON_NSIDS.FAVORITE,
      rkey: params.thingTid,
      record: {
        $type: LEXICON_NSIDS.FAVORITE,
        thing: params.thingRef,
        slot: params.slot,
        ...(params.catalogNumber ? { catalogNumber: params.catalogNumber } : {}),
        ...(params.name ? { name: params.name } : {}),
        createdAt: params.createdAtIso,
      },
    });
    return { uri: res.data.uri, cid: res.data.cid };
  } catch (err) {
    if (enqueueIfOffline) {
      await enqueuePendingPdsSync(
        params.userDid,
        "put_favorite",
        params.thingTid,
        {
          thingTid: params.thingTid,
          thingRef: params.thingRef,
          slot: params.slot,
          catalogNumber: params.catalogNumber,
          name: params.name,
          createdAtIso: params.createdAtIso,
        }
      );
    }
    console.warn("[user-pds] putUserFavoriteOnPds deferred:", err);
    return null;
  }
}

export async function deleteUserFavoriteOnPds(
  userDid: string,
  thingTid: string,
  enqueueIfOffline = true
): Promise<void> {
  const agent = await getUserAgent(userDid);
  if (!agent) {
    if (enqueueIfOffline) {
      await enqueuePendingPdsSync(userDid, "delete_favorite", thingTid, {
        thingTid,
      });
    }
    return;
  }
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: userDid,
      collection: LEXICON_NSIDS.FAVORITE,
      rkey: thingTid,
    });
  } catch (err) {
    console.warn("[user-pds] deleteUserFavoriteOnPds warning:", err);
  }
}

async function enqueuePendingPdsSync(
  targetDid: string,
  action: string,
  thingTid: string | undefined,
  payload: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  await db.insert(schema.pendingPdsSyncs).values({
    targetDid,
    action,
    thingTid: thingTid ?? null,
    payload,
  });
}

/**
 * Replays any queued PDS writes (e.g., things gifted to this user while their OAuth
 * session was offline) as soon as they have an active OAuth session again.
 */
export async function flushPendingPdsSyncsForUser(did: string): Promise<void> {
  const db = getDb();
  const pending = await db
    .select()
    .from(schema.pendingPdsSyncs)
    .where(
      and(
        eq(schema.pendingPdsSyncs.targetDid, did),
        isNull(schema.pendingPdsSyncs.completedAt)
      )
    );

  if (pending.length === 0) return;

  const agent = await getUserAgent(did);
  if (!agent) return;

  for (const job of pending) {
    try {
      if (job.action === "put_holding" && job.thingTid) {
        const thingRows = await db
          .select()
          .from(schema.things)
          .where(eq(schema.things.thingTid, job.thingTid))
          .limit(1);
        const thingRow = thingRows[0];

        if (thingRow && thingRow.currentOwnerDid === did) {
          const favRows = await db
            .select({ slot: schema.userFavoriteThings.slot })
            .from(schema.userFavoriteThings)
            .where(
              and(
                eq(schema.userFavoriteThings.userDid, did),
                eq(schema.userFavoriteThings.thingTid, job.thingTid)
              )
            )
            .limit(1);

          const iconBuf = thingRow.spritePngBase64
            ? Buffer.from(thingRow.spritePngBase64, "base64")
            : undefined;
          const p = job.payload as {
            thingRef: StrongRef;
            catalogNumber: number;
            name: string;
            category: string;
            description: string;
            status: "held" | "escrowed";
            acquiredAtIso: string;
            provenance: ProvenanceHop[];
          };
          const ref = await putUserHoldingOnPds(
            {
              ownerDid: did,
              thingTid: job.thingTid,
              thingRef: p.thingRef,
              catalogNumber: p.catalogNumber,
              name: p.name,
              category: p.category,
              description: p.description,
              iconPngBuffer: iconBuf,
              status: thingRow.status as "held" | "escrowed",
              favoriteSlot: favRows[0]?.slot ?? null,
              acquiredAtIso: p.acquiredAtIso,
              provenance: p.provenance,
            },
            false
          );
          if (ref) {
            await db
              .update(schema.things)
              .set({ currentHoldingAtUri: ref.uri })
              .where(eq(schema.things.thingTid, job.thingTid));
          }
        }
      } else if (job.action === "delete_holding" && job.thingTid) {
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: LEXICON_NSIDS.HOLDING,
          rkey: job.thingTid,
        });
      } else if (job.action === "put_favorite" && job.thingTid) {
        const [thingRow, favRow] = await Promise.all([
          db
            .select()
            .from(schema.things)
            .where(eq(schema.things.thingTid, job.thingTid))
            .limit(1)
            .then((r) => r[0]),
          db
            .select()
            .from(schema.userFavoriteThings)
            .where(
              and(
                eq(schema.userFavoriteThings.userDid, did),
                eq(schema.userFavoriteThings.thingTid, job.thingTid)
              )
            )
            .limit(1)
            .then((r) => r[0]),
        ]);

        if (thingRow && thingRow.currentOwnerDid === did && favRow) {
          const p = job.payload as {
            thingRef: StrongRef;
            createdAtIso?: string;
          };
          const ref = await putUserFavoriteOnPds(
            {
              userDid: did,
              thingTid: job.thingTid,
              thingRef: p.thingRef,
              slot: favRow.slot,
              catalogNumber: thingRow.catalogNumber,
              name: thingRow.name,
              createdAtIso: p.createdAtIso ?? favRow.createdAt.toISOString(),
            },
            false
          );
          if (!ref) {
            throw new Error("Could not sync com.giveathing.favorite yet.");
          }
        }
      } else if (job.action === "delete_favorite" && job.thingTid) {
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: LEXICON_NSIDS.FAVORITE,
          rkey: job.thingTid,
        });
      }

      await db
        .update(schema.pendingPdsSyncs)
        .set({ completedAt: new Date() })
        .where(eq(schema.pendingPdsSyncs.id, job.id));
    } catch (err) {
      await db
        .update(schema.pendingPdsSyncs)
        .set({
          attempts: job.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(schema.pendingPdsSyncs.id, job.id));
    }
  }
}
