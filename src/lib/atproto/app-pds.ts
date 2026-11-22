import fs from "node:fs";
import path from "node:path";
import { AtpAgent, type AtpSessionData } from "@atproto/api";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  ATMOSPHERE_GAME_RKEY,
  buildAtmosphereDefineRecord,
  LEXICON_NSIDS,
  type ProvenanceVia,
  type StrongRef,
} from "@/lib/lexicons";

const globalForAppAgent = globalThis as unknown as {
  appAgent?: AtpAgent;
  loginInFlight?: Promise<AtpAgent | null>;
};

export function isAppPdsConfigured(): boolean {
  return Boolean(
    process.env.APP_ATPROTO_IDENTIFIER?.trim() &&
      process.env.APP_ATPROTO_PASSWORD?.trim()
  );
}

/**
 * Returns an authenticated AtpAgent connected to Give a Thing's official PDS
 * (`@giveathing.com`), where immutable canonical `com.giveathing.thing`,
 * `com.giveathing.ledgerEntry`, and `games.atmosphere.define` records live.
 */
export async function getAppPdsAgent(): Promise<AtpAgent | null> {
  if (!isAppPdsConfigured()) {
    return null;
  }

  if (globalForAppAgent.appAgent?.session) {
    return globalForAppAgent.appAgent;
  }

  if (globalForAppAgent.loginInFlight) {
    return globalForAppAgent.loginInFlight;
  }

  globalForAppAgent.loginInFlight = (async () => {
    const service =
      process.env.APP_ATPROTO_SERVICE?.trim() || "https://bsky.social";
    const identifier = process.env.APP_ATPROTO_IDENTIFIER!.trim();
    const password = process.env.APP_ATPROTO_PASSWORD!.trim();
    const db = getDb();

    const agent = new AtpAgent({
      service,
      persistSession: async (evt, sess) => {
        if ((evt === "create" || evt === "update") && sess) {
          const sessionJson = JSON.stringify(sess);
          await db
            .insert(schema.appPdsSession)
            .values({
              id: "singleton",
              did: sess.did,
              sessionJson,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.appPdsSession.id,
              set: {
                did: sess.did,
                sessionJson,
                updatedAt: new Date(),
              },
            });
        } else if (evt === "expired" || evt === "create-failed") {
          await db
            .delete(schema.appPdsSession)
            .where(eq(schema.appPdsSession.id, "singleton"));
        }
      },
    });

    const cached = await db
      .select()
      .from(schema.appPdsSession)
      .where(eq(schema.appPdsSession.id, "singleton"))
      .limit(1);

    if (cached[0]) {
      try {
        const parsed = JSON.parse(cached[0].sessionJson) as AtpSessionData;
        await agent.resumeSession(parsed);
        globalForAppAgent.appAgent = agent;
        return agent;
      } catch {
        // Fall through to fresh login if cached JWT expired completely
      }
    }

    await agent.login({ identifier, password });
    globalForAppAgent.appAgent = agent;
    return agent;
  })().finally(() => {
    globalForAppAgent.loginInFlight = undefined;
  });

  return globalForAppAgent.loginInFlight;
}

export interface MintCanonicalThingParams {
  thingTid: string;
  entryTid: string;
  catalogNumber: number;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  flavorText: string;
  uselessTrait: string;
  iconPngBuffer: Buffer;
  iconAlt: string;
  discoveredByDid: string;
  pullUtcDate: string;
  createdAtIso: string;
}

export interface MintCanonicalThingResult {
  thingRef: StrongRef | null;
  ledgerRef: StrongRef | null;
  iconBlobCid: string | null;
}

/**
 * Publishes the immutable genesis `com.giveathing.thing` record, sprite blob,
 * and `com.giveathing.ledgerEntry` (#0) to `@giveathing.com`'s official PDS.
 */
export async function mintCanonicalThingOnAppPds(
  params: MintCanonicalThingParams
): Promise<MintCanonicalThingResult> {
  const agent = await getAppPdsAgent();
  if (!agent || !agent.session) {
    return { thingRef: null, ledgerRef: null, iconBlobCid: null };
  }

  const repo = agent.session.did;

  const blobRes = await agent.uploadBlob(params.iconPngBuffer, {
    encoding: "image/png",
  });
  const blobRef = blobRes.data.blob;
  const iconBlobCid =
    typeof blobRef.ref === "object" && "$link" in blobRef.ref
      ? String(blobRef.ref.$link)
      : blobRef.ref.toString();

  const thingRes = await agent.com.atproto.repo.putRecord({
    repo,
    collection: LEXICON_NSIDS.THING,
    rkey: params.thingTid,
    record: {
      $type: LEXICON_NSIDS.THING,
      catalogNumber: params.catalogNumber,
      name: params.name,
      category: params.category,
      subcategory: params.subcategory,
      description: params.description,
      flavorText: params.flavorText,
      uselessTrait: params.uselessTrait,
      icon: blobRef,
      iconAlt: params.iconAlt,
      discoveredBy: params.discoveredByDid,
      pullDate: params.pullUtcDate,
      createdAt: params.createdAtIso,
    },
  });

  const thingStrongRef: StrongRef = {
    uri: thingRes.data.uri,
    cid: thingRes.data.cid,
  };

  const ledgerRes = await agent.com.atproto.repo.putRecord({
    repo,
    collection: LEXICON_NSIDS.LEDGER_ENTRY,
    rkey: params.entryTid,
    record: {
      $type: LEXICON_NSIDS.LEDGER_ENTRY,
      thing: thingStrongRef,
      sequenceNum: 0,
      owner: params.discoveredByDid,
      via: "daily_pull",
      occurredAt: params.createdAtIso,
    },
  });

  return {
    thingRef: thingStrongRef,
    ledgerRef: { uri: ledgerRes.data.uri, cid: ledgerRes.data.cid },
    iconBlobCid,
  };
}

export interface AppendLedgerParams {
  entryTid: string;
  thingRef: StrongRef;
  prevEntryRef?: StrongRef;
  sequenceNum: number;
  ownerDid: string;
  previousOwnerDid?: string;
  via: ProvenanceVia;
  note?: string;
  userProofRef?: StrongRef;
  occurredAtIso: string;
}

export async function appendLedgerEntryOnAppPds(
  params: AppendLedgerParams
): Promise<StrongRef | null> {
  const agent = await getAppPdsAgent();
  if (!agent || !agent.session) {
    return null;
  }

  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.session.did,
    collection: LEXICON_NSIDS.LEDGER_ENTRY,
    rkey: params.entryTid,
    record: {
      $type: LEXICON_NSIDS.LEDGER_ENTRY,
      thing: params.thingRef,
      ...(params.prevEntryRef ? { prevEntry: params.prevEntryRef } : {}),
      sequenceNum: params.sequenceNum,
      owner: params.ownerDid,
      ...(params.previousOwnerDid
        ? { previousOwner: params.previousOwnerDid }
        : {}),
      via: params.via,
      ...(params.note ? { note: params.note } : {}),
      ...(params.userProofRef ? { userProof: params.userProofRef } : {}),
      occurredAt: params.occurredAtIso,
    },
  });

  return { uri: res.data.uri, cid: res.data.cid };
}

/**
 * Registers or updates `at://<app_did>/games.atmosphere.define/giveathing`
 * on `@giveathing.com`'s PDS so Give a Thing is indexed in the `atmosphere.games` game library!
 */
export async function publishAtmosphereGameDefineOnAppPds(): Promise<StrongRef | null> {
  const agent = await getAppPdsAgent();
  if (!agent || !agent.session) {
    return null;
  }

  const repo = agent.session.did;
  const rawAppUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://giveathing.com";
  const publicUrl = rawAppUrl.includes("127.0.0.1") || rawAppUrl.includes("localhost")
    ? "https://giveathing.com"
    : rawAppUrl;

  let existingCreatedAt: string | undefined;
  try {
    const existing = await agent.com.atproto.repo.getRecord({
      repo,
      collection: LEXICON_NSIDS.ATMOSPHERE_DEFINE,
      rkey: ATMOSPHERE_GAME_RKEY,
    });
    const val = existing.data.value as { createdAt?: string } | undefined;
    if (typeof val?.createdAt === "string") {
      existingCreatedAt = val.createdAt;
    }
  } catch {
    // First-time registration
  }

  let iconBlob: unknown = undefined;
  const icon256Path = path.join(process.cwd(), "public", "icon-256.png");
  if (fs.existsSync(icon256Path)) {
    const iconBytes = fs.readFileSync(icon256Path);
    const uploaded = await agent.uploadBlob(iconBytes, {
      encoding: "image/png",
    });
    iconBlob = uploaded.data.blob;
  }

  const record = buildAtmosphereDefineRecord({
    repoDid: repo,
    appUrl: publicUrl,
    iconBlob,
    createdAtIso: existingCreatedAt,
  });

  const res = await agent.com.atproto.repo.putRecord({
    repo,
    collection: LEXICON_NSIDS.ATMOSPHERE_DEFINE,
    rkey: ATMOSPHERE_GAME_RKEY,
    record,
  });

  return { uri: res.data.uri, cid: res.data.cid };
}
