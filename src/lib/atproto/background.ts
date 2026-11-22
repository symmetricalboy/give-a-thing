import WebSocket from "ws";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { LEXICON_NSIDS } from "@/lib/lexicons";
import { followPlayer } from "@/lib/social/follows";
import { flushPendingPdsSyncsForUser } from "@/lib/atproto/user-pds";
import {
  isAppPdsConfigured,
  publishAtmosphereGameDefineOnAppPds,
} from "@/lib/atproto/app-pds";

const globalForBg = globalThis as unknown as {
  bgStarted?: boolean;
};

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

export function startBackgroundServices(): void {
  if (globalForBg.bgStarted) return;
  if (!process.env.DATABASE_URL) return;
  if (process.env.ENABLE_IN_PROCESS_WORKER === "false") return;

  globalForBg.bgStarted = true;

  // 1. Register or update games.atmosphere.define record on @giveathing.com PDS if configured
  if (isAppPdsConfigured()) {
    void publishAtmosphereGameDefineOnAppPds()
      .then((ref) => {
        if (ref) {
          console.log(
            `[atmosphere.games] Registered games.atmosphere.define: ${ref.uri}`
          );
        }
      })
      .catch((err) => {
        console.warn("[atmosphere.games] Startup publish warning:", err);
      });
  }

  // 2. Start real-time ATProtocol Jetstream listener
  void startJetstreamLoop().catch((err) => {
    console.warn("[jetstream] Startup warning:", err);
  });
}

async function startJetstreamLoop() {
  const jetstreamBase =
    process.env.JETSTREAM_URL?.trim() ||
    "wss://jetstream2.us-east.bsky.network/subscribe";

  let optInUsersCache = new Set<string>();
  let allUsersCache = new Set<string>();
  let latestCursorUs = 0;

  const refreshCaches = async () => {
    const db = getDb();
    const rows = await db
      .select({
        did: schema.users.did,
        autoImport: schema.users.autoImportBskyFollows,
      })
      .from(schema.users);
    allUsersCache = new Set(rows.map((r) => r.did));
    optInUsersCache = new Set(rows.filter((r) => r.autoImport).map((r) => r.did));
  };

  await refreshCaches();
  setInterval(() => {
    void refreshCaches().catch(() => {});
  }, 30_000);

  setInterval(() => {
    if (latestCursorUs > 0) {
      const db = getDb();
      const str = String(latestCursorUs);
      void db
        .insert(schema.jetstreamCursor)
        .values({ id: "main", timeUs: str, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.jetstreamCursor.id,
          set: { timeUs: str, updatedAt: new Date() },
        })
        .catch(() => {});
    }
  }, 15_000);

  const handleEvent = async (evt: JetstreamEvent) => {
    const db = getDb();

    if (
      evt.kind === "identity" &&
      evt.identity?.handle &&
      allUsersCache.has(evt.did)
    ) {
      await db
        .update(schema.users)
        .set({ handle: evt.identity.handle, updatedAt: new Date() })
        .where(eq(schema.users.did, evt.did));
      return;
    }

    if (evt.kind !== "commit" || !evt.commit) return;

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
        }
      }
      return;
    }

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
      }
    }
  };

  const connect = async () => {
    const db = getDb();
    const savedRows = await db
      .select()
      .from(schema.jetstreamCursor)
      .where(eq(schema.jetstreamCursor.id, "main"))
      .limit(1);

    const wsUrl = new URL(jetstreamBase);
    wsUrl.searchParams.append("wantedCollections", "app.bsky.graph.follow");
    wsUrl.searchParams.append("wantedCollections", LEXICON_NSIDS.HOLDING);
    if (savedRows[0]?.timeUs) {
      wsUrl.searchParams.set("cursor", savedRows[0].timeUs);
    }

    console.log(`[jetstream] Subscribing to ${wsUrl.toString()}`);
    const ws = new WebSocket(wsUrl.toString());

    ws.on("message", (raw) => {
      try {
        const evt = JSON.parse(raw.toString()) as JetstreamEvent;
        if (evt.time_us) latestCursorUs = evt.time_us;
        void handleEvent(evt).catch(() => {});
      } catch {
        // Ignore non-JSON frame
      }
    });

    ws.on("close", () => {
      setTimeout(() => void connect().catch(() => {}), 5_000);
    });

    ws.on("error", () => {
      ws.close();
    });
  };

  await connect();
}
