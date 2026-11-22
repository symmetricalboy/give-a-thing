import { TID } from "@atproto/common-web";
import { z } from "zod";

export const LEXICON_NSIDS = {
  THING: "com.giveathing.thing",
  LEDGER_ENTRY: "com.giveathing.ledgerEntry",
  HOLDING: "com.giveathing.holding",
  TRANSFER: "com.giveathing.transfer",
  OFFER: "com.giveathing.offer",
  CLAIM: "com.giveathing.claim",
  FOLLOW: "com.giveathing.graph.follow",
  ATMOSPHERE_DEFINE: "games.atmosphere.define",
} as const;

export const ATMOSPHERE_GAME_RKEY = "giveathing";

export const USER_OAUTH_SCOPES = [
  "atproto",
  `repo:${LEXICON_NSIDS.HOLDING}`,
  `repo:${LEXICON_NSIDS.TRANSFER}`,
  `repo:${LEXICON_NSIDS.OFFER}`,
  `repo:${LEXICON_NSIDS.CLAIM}`,
  `repo:${LEXICON_NSIDS.FOLLOW}`,
  "blob:image/png",
].join(" ");

let lastTid: string | undefined;

/**
 * Generates a monotonically increasing ATProtocol TID (Timestamp Identifier).
 */
export function nextTid(): string {
  lastTid = TID.nextStr(lastTid);
  return lastTid;
}

export const StrongRefSchema = z.object({
  uri: z.string().startsWith("at://"),
  cid: z.string().min(1),
});

export type StrongRef = z.infer<typeof StrongRefSchema>;

export const ProvenanceViaSchema = z.enum([
  "daily_pull",
  "direct_gift",
  "escrow_claim",
]);

export type ProvenanceVia = z.infer<typeof ProvenanceViaSchema>;

export const ProvenanceHopSchema = z.object({
  sequenceNum: z.number().int().min(0),
  owner: z.string().startsWith("did:"),
  handleSnapshot: z.string().max(253).optional(),
  via: ProvenanceViaSchema,
  note: z.string().max(140).optional(),
  occurredAt: z.string(),
});

export type ProvenanceHop = z.infer<typeof ProvenanceHopSchema>;

export const ThingRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.THING),
  catalogNumber: z.number().int().min(1),
  name: z.string().min(1).max(240),
  category: z.string().min(1).max(100),
  subcategory: z.string().min(1).max(120),
  description: z.string().min(1).max(1200),
  flavorText: z.string().min(1).max(600),
  uselessTrait: z.string().max(160).optional(),
  icon: z.any(),
  iconAlt: z.string().min(1).max(600),
  discoveredBy: z.string().startsWith("did:"),
  pullDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string(),
});

export const LedgerEntryRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.LEDGER_ENTRY),
  thing: StrongRefSchema,
  prevEntry: StrongRefSchema.optional(),
  sequenceNum: z.number().int().min(0),
  owner: z.string().startsWith("did:"),
  previousOwner: z.string().startsWith("did:").optional(),
  via: ProvenanceViaSchema,
  note: z.string().max(140).optional(),
  userProof: StrongRefSchema.optional(),
  occurredAt: z.string(),
});

export const HoldingRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.HOLDING),
  thing: StrongRefSchema,
  catalogNumber: z.number().int().min(1),
  name: z.string().min(1).max(240),
  category: z.string().min(1).max(100),
  description: z.string().min(1).max(1200),
  icon: z.any().optional(),
  status: z.enum(["held", "escrowed"]),
  favoriteSlot: z.number().int().min(1).max(8).optional(),
  acquiredAt: z.string(),
  provenance: z.array(ProvenanceHopSchema),
});

export const TransferRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.TRANSFER),
  thing: StrongRefSchema,
  to: z.string().startsWith("did:"),
  note: z.string().max(140).optional(),
  transferredAt: z.string(),
});

export const OfferRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.OFFER),
  thing: StrongRefSchema,
  recipientDid: z.string().startsWith("did:"),
  note: z.string().max(140).optional(),
  createdAt: z.string(),
  revocableAfter: z.string(),
});

export const ClaimRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.CLAIM),
  offer: StrongRefSchema,
  thing: StrongRefSchema,
  claimedAt: z.string(),
});

export const FollowRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.FOLLOW),
  subject: z.string().startsWith("did:"),
  source: z.enum(["manual", "bsky_import", "bsky_auto"]),
  createdAt: z.string(),
});

export const AtmosphereDefineRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.ATMOSPHERE_DEFINE),
  name: z.string().min(1).max(100),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  url: z.string().url(),
  publisher: z.string().startsWith("at://"),
  category: z.enum(["browser", "download", "physical", "other"]),
  status: z.enum(["live", "beta", "coming", "archived"]).optional(),
  tags: z.array(z.string().max(32)).max(12).optional(),
  icon: z.any().optional(),
  developer: z
    .object({
      name: z.string().max(100),
      did: z.string().startsWith("did:").optional(),
      url: z.string().url().optional(),
    })
    .optional(),
  uses: z
    .array(
      z.object({
        nsid: z.string(),
        rkey: z.string().max(50).optional(),
        role: z.enum([
          "character",
          "perk",
          "cosmetic",
          "interop",
          "stats",
          "activity",
          "leaderboard",
          "profile",
          "session",
          "inventory",
          "other",
        ]),
        label: z.string().max(120).optional(),
        acquire: z.string().url().optional(),
        purpose: z.string().max(300).optional(),
        authority: z.string().startsWith("did:").optional(),
      })
    )
    .max(32)
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type AtmosphereDefineRecord = z.infer<
  typeof AtmosphereDefineRecordSchema
>;

export function buildAtmosphereDefineRecord(params: {
  repoDid: string;
  appUrl: string;
  iconBlob?: unknown;
  createdAtIso?: string;
  updatedAtIso?: string;
}): AtmosphereDefineRecord {
  const cleanUrl = params.appUrl.replace(/\/+$/, "");
  const nowIso = params.updatedAtIso ?? new Date().toISOString();
  const createdAt = params.createdAtIso ?? nowIso;

  return {
    $type: LEXICON_NSIDS.ATMOSPHERE_DEFINE,
    name: "Give a Thing",
    tagline:
      "Get a unique pointless 16-bit thing every day and give things to your friends.",
    description:
      "Every UTC midnight, click a button to get a completely pointless, never-duplicated thing with a 16-bit pixel-art inventory icon. Give any of your things to any of your friends at any time for no reason, building a permanent ownership ledger across ATProtocol.",
    url: cleanUrl,
    publisher: `at://${params.repoDid}`,
    category: "browser",
    status: "live",
    tags: ["social", "collectibles", "daily", "pixel-art", "trading"],
    ...(params.iconBlob ? { icon: params.iconBlob } : {}),
    developer: {
      name: "Give a Thing",
      did: params.repoDid,
      url: "https://bsky.app/profile/giveathing.com",
    },
    uses: [
      {
        nsid: LEXICON_NSIDS.HOLDING,
        rkey: "any",
        role: "inventory",
        label: "Things Owned",
        acquire: cleanUrl,
        purpose:
          "Things currently owned by a player, including provenance history and Top 8 favorite status.",
      },
      {
        nsid: LEXICON_NSIDS.TRANSFER,
        rkey: "any",
        role: "activity",
        label: "Things Given",
        acquire: cleanUrl,
        purpose: "Signed receipts of things a player has given away to friends.",
      },
      {
        nsid: LEXICON_NSIDS.THING,
        rkey: "any",
        role: "interop",
        authority: params.repoDid,
        label: "Discovered Things Catalog",
        acquire: `${cleanUrl}/catalog`,
        purpose:
          "Immutable genesis records for every unique thing discovered in Give a Thing.",
      },
    ],
    createdAt,
    updatedAt: nowIso,
  };
}

/**
 * Formats an `at://` URI into a public PDS Explorer link (`pdsls.dev`) so anyone
 * can inspect raw ATProtocol records across the decentralized network.
 */
export function buildPdsExplorerUrl(atUri: string): string {
  const clean = atUri.replace(/^at:\/\//, "");
  return `https://pdsls.dev/at/${clean}`;
}
