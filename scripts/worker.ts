import WebSocket from "ws";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { LEXICON_NSIDS } from "../src/lib/lexicons";
import { followPlayer } from "../src/lib/social/follows";
import { flushPendingPdsSyncsForUser } from "../src/lib/atproto/user-pds";

/**
 * Give a Thing — ATProtocol Jetstream & Reconciliation Worker
 *
 * Responsibilities:
 * 1. Subscribes to ATProtocol Jetstream (`app.bsky.graph.follow` + `com.giveathing.holding` + `identity` events).
 * 2. Auto-imports new Bluesky follows in real time for players with `auto_import_bsky_follows = true`.
 * 3. Updates player handles on live ATProtocol `identity` handle changes.
 * 4. Enforces the Indestructible Thing rule: if a player externally deletes a `com.giveathing.holding`
 *    record while still the canonical owner, queues an automatic PDS holding restore!
 */

const JETSTREAM_BASE =
  process.env.JETSTREAM_URL?.trim() ||
  "wss://jetstream2.us-east.bsky.network/subscribe";

interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: "commit" | "identity" | "account";
  identity?: {
    did: string;
    handle: string;
  };
  commit?: {
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    record?: Record<string, unknown>;
    cid?: string;
  };
}

let optInUsersCache = new Set<string>();
let allUsersCache = new Set<string>();

async function refreshUserCaches() {
  const db = getDb();
  const rows = await db
    .select({
      did: schema.users.did,
      autoImport: schema.users.autoImportBskyFollows,
    })
    .from(schema.users);

  allUsersCache = new Set(rows.map((r) => r.did));
  optInUsersCache = new Set(
    rows.filter((r) => r.autoImport).map((r) => r.did)
  );
}

async function getSavedCursor(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.jetstreamCursor)
    .where(eq(schema.jetstreamCursor.id, "main"))
    .limit(1);
  return rows[0]?.timeUs ?? null;
}

async function saveCursor(timeUs: number) {
  const db = getDb();
  const str = String(timeUs);
  await db
    .insert(schema.jetstreamCursor)
    .values({ id: "main", timeUs: str, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.jetstreamCursor.id,
      set: { timeUs: str, updatedAt: new Date() },
    });
}

async function handleJetstreamMessage(evt: JetstreamEvent) {
  const db = getDb();

  // 1. Live Bluesky handle change
  if (evt.kind === "identity" && evt.identity?.handle && allUsersCache.has(evt.did)) {
    await db
      .update(schema.users)
      .set({ handle: evt.identity.handle, updatedAt: new Date() })
      .where(eq(schema.users.did, evt.did));
    return;
  }

  if (evt.kind !== "commit" || !evt.commit) return;

  // 2. Real-time Auto-Import of Bluesky Follows
  if (
    evt.commit.collection === "app.bsky.graph.follow" &&
    evt.commit.operation === "create" &&
    optInUsersCache.has(evt.did)
  ) {
    const subjectDid = evt.commit.record?.subject;
    if (typeof subjectDid === "string" && subjectDid.startsWith("did:")) {
      await db
        .insert(schema.bskyKnownFollows)
        .values({ followerDid: evt.did, targetDid: subjectDid })
        .onConflictDoNothing();

      if (allUsersCache.has(subjectDid)) {
        await followPlayer({
          followerDid: evt.did,
          subjectDid,
          source: "bsky_auto",
        });
        console.log(
          `[jetstream] Auto-imported Bluesky follow: ${evt.did} -> ${subjectDid}`
        );
      }
    }
    return;
  }

  // 3. Indestructible Thing Guard: restore holding if deleted externally while still owned
  if (
    evt.commit.collection === LEXICON_NSIDS.HOLDING &&
    evt.commit.operation === "delete" &&
    allUsersCache.has(evt.did)
  ) {
    const thingTid = evt.commit.rkey;
    const [thingRow] = await db
      .select()
      .from(schema.things)
      .where(eq(schema.things.thingTid, thingTid))
      .limit(1);

    if (thingRow && thingRow.currentOwnerDid === evt.did) {
      const ledgerRows = await db
        .select()
        .from(schema.provenanceEntries)
        .where(eq(schema.provenanceEntries.thingTid, thingTid))
        .orderBy(asc(schema.provenanceEntries.sequenceNum));

      await db.insert(schema.pendingPdsSyncs).values({
        targetDid: evt.did,
        action: "put_holding",
        thingTid,
        payload: {
          thingTid,
          thingRef: {
            uri:
              thingRow.canonicalAtUri ??
              `at://${thingRow.discovererDid}/com.giveathing.thing/${thingTid}`,
            cid: thingRow.canonicalAtCid ?? `bafkrei${thingTid}`,
          },
          catalogNumber: thingRow.catalogNumber,
          name: thingRow.name,
          category: thingRow.category,
          description: thingRow.description,
          status: thingRow.status,
          acquiredAtIso:
            ledgerRows[ledgerRows.length - 1]?.occurredAt.toISOString() ??
            thingRow.createdAt.toISOString(),
          provenance: ledgerRows.map((l) => ({
            sequenceNum: l.sequenceNum,
            owner: l.toDid,
            handleSnapshot: l.toHandleSnapshot,
            via: l.via,
            ...(l.note ? { note: l.note } : {}),
            occurredAt: l.occurredAt.toISOString(),
          })),
        },
      });
      await flushPendingPdsSyncsForUser(evt.did);
      console.log(
        `[jetstream] Restored externally-deleted holding ${thingTid} for ${evt.did}`
      );
    }
  }
}

async function startWorker() {
  console.log("[worker] Starting Give a Thing Jetstream & Sync Worker...");
  await refreshUserCaches();
  setInterval(() => {
    void refreshUserCaches().catch((e) =>
      console.warn("[worker] Cache refresh warning:", e)
    );
  }, 30_000);

  let latestCursorUs = 0;
  setInterval(() => {
    if (latestCursorUs > 0) {
      void saveCursor(latestCursorUs).catch(() => {});
    }
  }, 15_000);

  const connect = async () => {
    const saved = await getSavedCursor();
    const wsUrl = new URL(JETSTREAM_BASE);
    wsUrl.searchParams.append("wantedCollections", "app.bsky.graph.follow");
    wsUrl.searchParams.append("wantedCollections", LEXICON_NSIDS.HOLDING);
    if (saved) {
      wsUrl.searchParams.set("cursor", saved);
    }

    console.log(`[worker] Connecting to ${wsUrl.toString()}`);
    const ws = new WebSocket(wsUrl.toString());

    ws.on("message", (raw) => {
      try {
        const evt = JSON.parse(raw.toString()) as JetstreamEvent;
        if (evt.time_us) latestCursorUs = evt.time_us;
        void handleJetstreamMessage(evt).catch((err) =>
          console.warn("[worker] Event handler error:", err)
        );
      } catch {
        // Ignore malformed frame
      }
    });

    ws.on("close", () => {
      console.warn("[worker] Jetstream socket closed. Reconnecting in 5s...");
      setTimeout(() => void connect(), 5_000);
    });

    ws.on("error", (err) => {
      console.error("[worker] Jetstream socket error:", err);
      ws.close();
    });
  };

  await connect();
}

startWorker().catch((err) => {
  console.error("[worker] Fatal startup error:", err);
  process.exit(1);
});
