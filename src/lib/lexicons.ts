import { TID } from "@atproto/common-web";
import { z } from "zod";

export const LEXICON_NSIDS = {
  THING: "com.giveathing.thing",
  LEDGER: "com.giveathing.ledger",
  HOLDING: "com.giveathing.holding",
  FAVORITE: "com.giveathing.favorite",
  TRANSFER: "com.giveathing.transfer",
  OFFER: "com.giveathing.offer",
  CLAIM: "com.giveathing.claim",
  FOLLOW: "com.giveathing.graph.follow",
  ATMOSPHERE_DEFINE: "games.atmosphere.define",
} as const;

export const ATMOSPHERE_GAME_RKEY = "giveathing";

export const USER_OAUTH_SCOPES = [
  "atproto",
  `repo:${LEXICON_NSIDS.THING}`,
  `repo:${LEXICON_NSIDS.HOLDING}`,
  `repo:${LEXICON_NSIDS.FAVORITE}`,
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
  "mystery_box",
  "mystery_box_purchase",
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
  createdBy: z.string().startsWith("did:").optional(),
  collectionId: z.string().min(1).max(64).optional(),
  discoveredBy: z.string().startsWith("did:"),
  pullDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string(),
});

export const LedgerRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.LEDGER),
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

export const FavoriteRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.FAVORITE),
  thing: StrongRefSchema,
  slot: z.number().int().min(1).max(8),
  catalogNumber: z.number().int().min(1).optional(),
  name: z.string().min(1).max(240).optional(),
  createdAt: z.string(),
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

export const AtmosphereFilterSchema = z.object({
  field: z.string().max(200),
  op: z.enum([
    "exists",
    "notExists",
    "isPlayer",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
  ]),
  value: z.unknown().optional(),
});

export const AtmosphereRuleSchema: z.ZodType<{
  check: "record" | "field" | "matches" | "vouch" | "all" | "any" | "not";
  nsid?: string;
  rkey?: string;
  field?: string;
  op?: string;
  value?: unknown;
  authority?: string;
  filters?: Array<z.infer<typeof AtmosphereFilterSchema>>;
  label?: string;
  acquire?: string;
}> = z.object({
  check: z.enum(["record", "field", "matches", "vouch", "all", "any", "not"]),
  nsid: z.string().optional(),
  rkey: z.string().max(50).optional(),
  field: z.string().max(200).optional(),
  op: z.string().optional(),
  value: z.unknown().optional(),
  authority: z.string().startsWith("did:").optional(),
  filters: z.array(AtmosphereFilterSchema).max(8).optional(),
  label: z.string().max(120).optional(),
  acquire: z.string().url().optional(),
});

export const AtmosphereMediaItemSchema = z.object({
  image: z.any(),
  type: z
    .enum([
      "screenshot",
      "banner",
      "artwork",
      "poster",
      "background",
      "logo",
      "thumbnail",
    ])
    .optional(),
  alt: z.string().max(300).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type AtmosphereMediaItem = z.infer<typeof AtmosphereMediaItemSchema>;

export const AtmosphereDefineRecordSchema = z.object({
  $type: z.literal(LEXICON_NSIDS.ATMOSPHERE_DEFINE),
  name: z.string().min(1).max(100),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  url: z.string().url(),
  publisher: z.string().startsWith("at://"),
  legacyIds: z.array(z.string().max(80)).max(12).optional(),
  category: z.enum(["browser", "download", "physical", "other"]),
  status: z.string().max(40).optional(),
  releasedAt: z.string().optional(),
  tags: z.array(z.string().max(32)).max(12).optional(),
  cover: z.any().optional(),
  icon: z.any().optional(),
  media: z.array(AtmosphereMediaItemSchema).max(24).optional(),
  developer: z
    .object({
      name: z.string().max(100),
      did: z.string().startsWith("did:").optional(),
      url: z.string().url().optional(),
    })
    .optional(),
  claimAllowed: z.array(z.string().max(128)).max(12).optional(),
  requires: z.array(AtmosphereRuleSchema).max(16).optional(),
  uses: z
    .array(
      z.object({
        nsid: z.string(),
        rkey: z.string().max(50).optional(),
        path: z.string().max(200).optional(),
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
        filters: z.array(AtmosphereFilterSchema).max(8).optional(),
        verify: AtmosphereRuleSchema.optional(),
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
  coverBlob?: unknown;
  createdAtIso?: string;
  releasedAtIso?: string;
  updatedAtIso?: string;
}): AtmosphereDefineRecord {
  const cleanUrl = params.appUrl.replace(/\/+$/, "");
  const nowIso = params.updatedAtIso ?? new Date().toISOString();
  const createdAt = params.createdAtIso ?? nowIso;
  const releasedAt = params.releasedAtIso ?? createdAt;

  return {
    $type: LEXICON_NSIDS.ATMOSPHERE_DEFINE,
    name: "Give a Thing",
    tagline: "Get a Pointless Thing Every Day & Give Things Away",
    description:
      "Every day at UTC midnight, unwrap a mystery parcel to get one completely pointless, never-duplicated 16-bit thing. Feature your favorites in your profile Top 8 or give any of your things away to friends at any time for no reason—complete with gift notes and a permanent ownership ledger on ATProtocol. Currently in Alpha.",
    url: cleanUrl,
    publisher: `at://${params.repoDid}`,
    legacyIds: ["giveathing", "give-a-thing"],
    category: "browser",
    status: "alpha",
    releasedAt,
    tags: ["Alpha", "Collectibles", "Social"],
    ...(params.coverBlob ? { cover: params.coverBlob } : {}),
    ...(params.iconBlob ? { icon: params.iconBlob } : {}),
    developer: {
      name: "symmetricalboy.com",
      did: "did:plc:33d7gnwiagm6cimpiepefp72",
      url: "https://symmetricalboy.com",
    },
    claimAllowed: [
      "did:plc:33d7gnwiagm6cimpiepefp72",
      "symmetricalboy.com",
      params.repoDid,
      "giveathing.com",
    ],
    requires: [
      {
        check: "record",
        nsid: "app.bsky.actor.profile",
        rkey: "self",
        label:
          "Sign in with your Bluesky / ATProtocol account to pull daily things and give things to friends.",
        acquire: "https://bsky.app",
      },
    ],
    uses: [
      {
        nsid: LEXICON_NSIDS.HOLDING,
        rkey: "any",
        role: "inventory",
        label: "Things Owned",
        acquire: `${cleanUrl}/profile`,
        purpose:
          "Active possession records in each player's PDS for every pointless 16-bit thing they currently hold, including provenance hops.",
        verify: {
          check: "record",
          nsid: LEXICON_NSIDS.HOLDING,
          label: "Holds at least one thing in their bag",
          acquire: cleanUrl,
        },
      },
      {
        nsid: LEXICON_NSIDS.FAVORITE,
        rkey: "any",
        role: "profile",
        label: "Profile Top 8 Favorite Things",
        acquire: cleanUrl,
        purpose:
          "Features up to 8 favorite owned things at the top of a player's profile, stored in their PDS.",
        verify: {
          check: "record",
          nsid: LEXICON_NSIDS.FAVORITE,
          label: "Features a favorite thing on their profile",
          acquire: cleanUrl,
        },
      },
      {
        nsid: LEXICON_NSIDS.THING,
        rkey: "any",
        role: "interop",
        authority: params.repoDid,
        label: "Discovered Things Catalog",
        acquire: `${cleanUrl}/search`,
        purpose:
          "Immutable genesis records in @giveathing.com's PDS for every unique, never-duplicated thing pulled by players, with its 16-bit sprite blob and pointless trait.",
        verify: {
          check: "vouch",
          authority: params.repoDid,
          nsid: LEXICON_NSIDS.THING,
          label: "Discovered a thing on Give a Thing",
          acquire: cleanUrl,
          filters: [
            {
              field: "discoveredBy",
              op: "isPlayer",
            },
          ],
        },
      },
      {
        nsid: LEXICON_NSIDS.LEDGER,
        rkey: "any",
        role: "activity",
        authority: params.repoDid,
        label: "Permanent Ownership Ledger",
        acquire: `${cleanUrl}/search`,
        purpose:
          "Append-only provenance chain recording the original discoverer and every subsequent owner and 140-character gift note for each thing.",
      },
      {
        nsid: LEXICON_NSIDS.TRANSFER,
        rkey: "any",
        role: "activity",
        label: "Direct Gift Receipts",
        acquire: `${cleanUrl}/profile`,
        purpose:
          "Signed transfer receipts published in a sender's PDS whenever they give a thing to another player.",
      },
      {
        nsid: LEXICON_NSIDS.OFFER,
        rkey: "any",
        role: "activity",
        label: "Pending Gift Escrow Offers",
        acquire: `${cleanUrl}/profile`,
        purpose:
          "Escrow offers reserving a thing for a Bluesky friend who has not joined Give a Thing yet, revocable by the sender after 24 hours if unclaimed.",
      },
      {
        nsid: LEXICON_NSIDS.CLAIM,
        rkey: "any",
        role: "activity",
        label: "Claimed Gift Receipts",
        acquire: cleanUrl,
        purpose:
          "Signed claim records written to a recipient's PDS when they accept a pending gift offer.",
      },
      {
        nsid: LEXICON_NSIDS.FOLLOW,
        rkey: "any",
        role: "profile",
        label: "Give a Thing Friends Graph",
        acquire: `${cleanUrl}/friends`,
        purpose:
          "Player follow graph powering the Following social feed and quick friend gifting picker.",
      },
      {
        nsid: "app.bsky.graph.follow",
        rkey: "any",
        role: "interop",
        label: "Bluesky Follows Import",
        acquire: "https://bsky.app",
        purpose:
          "Imports Bluesky friends who also play Give a Thing and optionally auto-follows friends as they join.",
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
