import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    did: text("did").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    pdsUrl: text("pds_url"),
    autoImportBskyFollows: boolean("auto_import_bsky_follows")
      .notNull()
      .default(false),
    stripeAccountId: text("stripe_account_id"),
    stripePayoutsReady: boolean("stripe_payouts_ready")
      .notNull()
      .default(false),
    lastBskySyncAt: timestamp("last_bsky_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_handle_idx").on(table.handle)]
);

export const things = pgTable(
  "things",
  {
    thingTid: text("thing_tid").primaryKey(),
    catalogNumber: bigserial("catalog_number", { mode: "number" })
      .notNull()
      .unique(),
    name: text("name").notNull(),
    canonicalFingerprint: text("canonical_fingerprint").notNull().unique(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull(),
    description: text("description").notNull(),
    flavorText: text("flavor_text").notNull(),
    uselessTrait: text("useless_trait").notNull(),
    iconAlt: text("icon_alt").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    iconBlobCid: text("icon_blob_cid"),
    iconUrl: text("icon_url").notNull(),
    spritePngBase64: text("sprite_png_base64"),
    createdByDid: text("created_by_did").references(() => users.did),
    collectionId: text("collection_id"),
    discovererDid: text("discoverer_did")
      .notNull()
      .references(() => users.did),
    pullUtcDate: varchar("pull_utc_date", { length: 10 }).notNull(),
    pullSlot: integer("pull_slot").notNull().default(1),
    currentOwnerDid: text("current_owner_did")
      .notNull()
      .references(() => users.did),
    status: varchar("status", { length: 20 }).notNull().default("held"),
    transferCount: integer("transfer_count").notNull().default(0),
    canonicalAtUri: text("canonical_at_uri"),
    canonicalAtCid: text("canonical_at_cid"),
    latestLedgerAtUri: text("latest_ledger_at_uri"),
    latestLedgerAtCid: text("latest_ledger_at_cid"),
    currentHoldingAtUri: text("current_holding_at_uri"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("things_discoverer_utc_date_slot_idx").on(
      table.discovererDid,
      table.pullUtcDate,
      table.pullSlot
    ),
    index("things_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    index("things_owner_idx").on(table.currentOwnerDid),
    index("things_created_by_idx").on(table.createdByDid),
    index("things_collection_idx").on(table.collectionId),
    index("things_category_idx").on(table.category),
    index("things_transfer_count_idx").on(table.transferCount),
    index("things_created_at_idx").on(table.createdAt),
  ]
);

export const userFavoriteThings = pgTable(
  "user_favorite_things",
  {
    userDid: text("user_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    thingTid: text("thing_tid")
      .notNull()
      .references(() => things.thingTid, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userDid, table.thingTid] }),
    index("user_fav_slot_idx").on(table.userDid, table.slot),
  ]
);

export const dailyPullLocks = pgTable(
  "daily_pull_locks",
  {
    did: text("did").notNull(),
    pullUtcDate: varchar("pull_utc_date", { length: 10 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("in_progress"),
    thingTid: text("thing_tid"),
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.did, table.pullUtcDate] })]
);

export const dailyPullCache = pgTable(
  "daily_pull_cache",
  {
    cacheTid: text("cache_tid").primaryKey(),
    name: text("name").notNull(),
    canonicalFingerprint: text("canonical_fingerprint").notNull().unique(),
    subcategoryKey: text("subcategory_key").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull(),
    description: text("description").notNull(),
    flavorText: text("flavor_text").notNull(),
    uselessTrait: text("useless_trait").notNull(),
    iconAlt: text("icon_alt").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    sprite64PngBase64: text("sprite64_png_base64").notNull(),
    sprite512PngBase64: text("sprite512_png_base64").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("daily_pull_cache_created_idx").on(table.createdAt),
    index("daily_pull_cache_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export const provenanceEntries = pgTable(
  "provenance_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entryTid: text("entry_tid").notNull().unique(),
    thingTid: text("thing_tid")
      .notNull()
      .references(() => things.thingTid, { onDelete: "cascade" }),
    sequenceNum: integer("sequence_num").notNull(),
    fromDid: text("from_did"),
    fromHandleSnapshot: text("from_handle_snapshot"),
    toDid: text("to_did").notNull(),
    toHandleSnapshot: text("to_handle_snapshot").notNull(),
    via: varchar("via", { length: 32 }).notNull(),
    note: varchar("note", { length: 140 }),
    ledgerAtUri: text("ledger_at_uri"),
    ledgerAtCid: text("ledger_at_cid"),
    userProofAtUri: text("user_proof_at_uri"),
    userProofAtCid: text("user_proof_at_cid"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("provenance_thing_seq_idx").on(
      table.thingTid,
      table.sequenceNum
    ),
    index("provenance_thing_idx").on(table.thingTid),
  ]
);

export const escrowOffers = pgTable(
  "escrow_offers",
  {
    offerTid: text("offer_tid").primaryKey(),
    thingTid: text("thing_tid")
      .notNull()
      .references(() => things.thingTid),
    senderDid: text("sender_did")
      .notNull()
      .references(() => users.did),
    recipientDid: text("recipient_did").notNull(),
    recipientHandleSnapshot: text("recipient_handle_snapshot").notNull(),
    recipientDisplayName: text("recipient_display_name"),
    recipientAvatarUrl: text("recipient_avatar_url"),
    note: varchar("note", { length: 140 }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    offerAtUri: text("offer_at_uri"),
    offerAtCid: text("offer_at_cid"),
    claimAtUri: text("claim_at_uri"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revocableAfter: timestamp("revocable_after", {
      withTimezone: true,
    }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("escrow_sender_idx").on(table.senderDid),
    index("escrow_recipient_idx").on(table.recipientDid),
    index("escrow_thing_idx").on(table.thingTid),
  ]
);

export const follows = pgTable(
  "follows",
  {
    followerDid: text("follower_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    subjectDid: text("subject_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    followTid: text("follow_tid").notNull(),
    source: varchar("source", { length: 24 }).notNull().default("manual"),
    atUri: text("at_uri"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerDid, table.subjectDid] }),
    index("follows_subject_idx").on(table.subjectDid),
  ]
);

export const bskyKnownFollows = pgTable(
  "bsky_known_follows",
  {
    followerDid: text("follower_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    targetDid: text("target_did").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerDid, table.targetDid] }),
    index("bsky_known_target_idx").on(table.targetDid),
  ]
);

export const feedEvents = pgTable(
  "feed_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    actorDid: text("actor_did")
      .notNull()
      .references(() => users.did),
    targetDid: text("target_did").references(() => users.did),
    thingTid: text("thing_tid").references(() => things.thingTid, {
      onDelete: "cascade",
    }),
    collectionTid: text("collection_tid").references(
      () => thingCollections.collectionTid,
      { onDelete: "cascade" }
    ),
    sequenceNum: integer("sequence_num").notNull().default(0),
    note: varchar("note", { length: 140 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("feed_events_created_idx").on(table.createdAt),
    index("feed_events_actor_idx").on(table.actorDid),
    index("feed_events_target_idx").on(table.targetDid),
    index("feed_events_collection_idx").on(table.collectionTid),
  ]
);

export const oauthStates = pgTable("oauth_states", {
  key: text("key").primaryKey(),
  stateJson: text("state_json").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const oauthSessions = pgTable("oauth_sessions", {
  did: text("did").primaryKey(),
  sessionJson: text("session_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appPdsSession = pgTable("app_pds_session", {
  id: text("id").primaryKey(),
  did: text("did").notNull(),
  sessionJson: text("session_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pendingPdsSyncs = pgTable(
  "pending_pds_syncs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    targetDid: text("target_did").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    thingTid: text("thing_tid"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("pending_pds_target_idx").on(table.targetDid)]
);

export const subcategoryStats = pgTable("subcategory_stats", {
  subcategoryKey: text("subcategory_key").primaryKey(),
  macroCategory: text("macro_category").notNull(),
  subcategory: text("subcategory").notNull(),
  pullCount: integer("pull_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const jetstreamCursor = pgTable("jetstream_cursor", {
  id: text("id").primaryKey(),
  timeUs: text("time_us").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const thingCollections = pgTable(
  "thing_collections",
  {
    collectionTid: text("collection_tid").primaryKey(),
    creatorDid: text("creator_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 280 }),
    totalItems: integer("total_items").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    platformFeeBps: integer("platform_fee_bps").notNull().default(0),
    canonicalAtUri: text("canonical_at_uri"),
    canonicalAtCid: text("canonical_at_cid"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("thing_collections_creator_idx").on(table.creatorDid)]
);

export const collectionPurchases = pgTable(
  "collection_purchases",
  {
    purchaseId: text("purchase_id").primaryKey(),
    collectionTid: text("collection_tid")
      .notNull()
      .references(() => thingCollections.collectionTid, {
        onDelete: "cascade",
      }),
    thingTid: text("thing_tid").notNull(),
    buyerDid: text("buyer_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    creatorDid: text("creator_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    checkoutSessionId: text("checkout_session_id").unique(),
    paymentIntentId: text("payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("collection_purchases_buyer_idx").on(table.buyerDid),
    index("collection_purchases_collection_idx").on(table.collectionTid),
    index("collection_purchases_status_exp_idx").on(
      table.status,
      table.expiresAt
    ),
  ]
);

export const collectionDailyClaims = pgTable(
  "collection_daily_claims",
  {
    collectionTid: text("collection_tid")
      .notNull()
      .references(() => thingCollections.collectionTid, {
        onDelete: "cascade",
      }),
    claimerDid: text("claimer_did")
      .notNull()
      .references(() => users.did, { onDelete: "cascade" }),
    pullUtcDate: varchar("pull_utc_date", { length: 10 }).notNull(),
    thingTid: text("thing_tid").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.collectionTid, table.claimerDid, table.pullUtcDate],
    }),
    index("collection_claims_claimer_idx").on(
      table.claimerDid,
      table.pullUtcDate
    ),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type ThingRow = typeof things.$inferSelect;
export type ThingCollectionRow = typeof thingCollections.$inferSelect;
export type ProvenanceEntryRow = typeof provenanceEntries.$inferSelect;
export type EscrowOfferRow = typeof escrowOffers.$inferSelect;
export type FeedEventRow = typeof feedEvents.$inferSelect;
