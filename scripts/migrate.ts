import postgres from "postgres";

/**
 * Self-contained idempotent schema bootstrapper for Railway & local PostgreSQL.
 * Automatically enables `vector` (pgvector) and creates all tables and indexes.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL environment variable.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  try {
    console.log("[db:migrate] Enabling pgvector extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    console.log("[db:migrate] Applying Give a Thing schema...");
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS users (
        did TEXT PRIMARY KEY,
        handle TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        pds_url TEXT,
        auto_import_bsky_follows BOOLEAN NOT NULL DEFAULT FALSE,
        last_bsky_sync_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_ready BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS users_handle_idx ON users (handle);

      CREATE TABLE IF NOT EXISTS things (
        thing_tid TEXT PRIMARY KEY,
        catalog_number BIGSERIAL NOT NULL UNIQUE,
        name TEXT NOT NULL,
        canonical_fingerprint TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        subcategory TEXT NOT NULL,
        description TEXT NOT NULL,
        flavor_text TEXT NOT NULL,
        useless_trait TEXT NOT NULL,
        icon_alt TEXT NOT NULL,
        embedding vector(768) NOT NULL,
        icon_blob_cid TEXT,
        icon_url TEXT NOT NULL,
        sprite_png_base64 TEXT,
        discoverer_did TEXT NOT NULL REFERENCES users(did),
        pull_utc_date VARCHAR(10) NOT NULL,
        pull_slot INTEGER NOT NULL DEFAULT 1,
        current_owner_did TEXT NOT NULL REFERENCES users(did),
        status VARCHAR(20) NOT NULL DEFAULT 'held',
        transfer_count INTEGER NOT NULL DEFAULT 0,
        canonical_at_uri TEXT,
        canonical_at_cid TEXT,
        latest_ledger_at_uri TEXT,
        latest_ledger_at_cid TEXT,
        current_holding_at_uri TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE things ADD COLUMN IF NOT EXISTS pull_slot INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE things ADD COLUMN IF NOT EXISTS created_by_did TEXT REFERENCES users(did);
      ALTER TABLE things ADD COLUMN IF NOT EXISTS collection_id TEXT;
      DROP INDEX IF EXISTS things_discoverer_utc_date_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS things_discoverer_utc_date_slot_idx ON things (discoverer_did, pull_utc_date, pull_slot);
      CREATE INDEX IF NOT EXISTS things_embedding_hnsw_idx ON things USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS things_owner_idx ON things (current_owner_did);
      CREATE INDEX IF NOT EXISTS things_created_by_idx ON things (created_by_did);
      CREATE INDEX IF NOT EXISTS things_collection_idx ON things (collection_id);
      CREATE INDEX IF NOT EXISTS things_category_idx ON things (category);
      CREATE INDEX IF NOT EXISTS things_transfer_count_idx ON things (transfer_count);
      CREATE INDEX IF NOT EXISTS things_created_at_idx ON things (created_at);

      CREATE TABLE IF NOT EXISTS thing_collections (
        collection_tid TEXT PRIMARY KEY,
        creator_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(280),
        total_items INTEGER NOT NULL,
        price_cents INTEGER NOT NULL DEFAULT 0,
        platform_fee_bps INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE thing_collections ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE thing_collections ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS thing_collections_creator_idx ON thing_collections (creator_did);

      CREATE TABLE IF NOT EXISTS collection_purchases (
        purchase_id TEXT PRIMARY KEY,
        collection_tid TEXT NOT NULL REFERENCES thing_collections(collection_tid) ON DELETE CASCADE,
        thing_tid TEXT NOT NULL,
        buyer_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        creator_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        stripe_account_id TEXT NOT NULL,
        checkout_session_id TEXT UNIQUE,
        payment_intent_id TEXT,
        amount_cents INTEGER NOT NULL,
        platform_fee_cents INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NOT NULL,
        fulfilled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS collection_purchases_buyer_idx ON collection_purchases (buyer_did);
      CREATE INDEX IF NOT EXISTS collection_purchases_collection_idx ON collection_purchases (collection_tid);
      CREATE INDEX IF NOT EXISTS collection_purchases_status_exp_idx ON collection_purchases (status, expires_at);

      CREATE TABLE IF NOT EXISTS collection_daily_claims (
        collection_tid TEXT NOT NULL REFERENCES thing_collections(collection_tid) ON DELETE CASCADE,
        claimer_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        pull_utc_date VARCHAR(10) NOT NULL,
        thing_tid TEXT NOT NULL,
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection_tid, claimer_did, pull_utc_date)
      );
      CREATE INDEX IF NOT EXISTS collection_claims_claimer_idx ON collection_daily_claims (claimer_did, pull_utc_date);

      -- Backfill created_by_did on all existing generated things to @giveathing.com
      UPDATE things
      SET created_by_did = COALESCE(
        (SELECT did FROM users WHERE lower(handle) = 'giveathing.com' LIMIT 1),
        discoverer_did
      )
      WHERE created_by_did IS NULL;

      CREATE TABLE IF NOT EXISTS user_favorite_things (
        user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        thing_tid TEXT NOT NULL REFERENCES things(thing_tid) ON DELETE CASCADE,
        slot INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_did, thing_tid)
      );
      CREATE INDEX IF NOT EXISTS user_fav_slot_idx ON user_favorite_things (user_did, slot);

      CREATE TABLE IF NOT EXISTS daily_pull_locks (
        did TEXT NOT NULL,
        pull_utc_date VARCHAR(10) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
        thing_tid TEXT,
        locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (did, pull_utc_date)
      );

      CREATE TABLE IF NOT EXISTS provenance_entries (
        id BIGSERIAL PRIMARY KEY,
        entry_tid TEXT NOT NULL UNIQUE,
        thing_tid TEXT NOT NULL REFERENCES things(thing_tid) ON DELETE CASCADE,
        sequence_num INTEGER NOT NULL,
        from_did TEXT,
        from_handle_snapshot TEXT,
        to_did TEXT NOT NULL,
        to_handle_snapshot TEXT NOT NULL,
        via VARCHAR(32) NOT NULL,
        note VARCHAR(140),
        ledger_at_uri TEXT,
        ledger_at_cid TEXT,
        user_proof_at_uri TEXT,
        user_proof_at_cid TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE provenance_entries ALTER COLUMN via TYPE VARCHAR(32);
      CREATE UNIQUE INDEX IF NOT EXISTS provenance_thing_seq_idx ON provenance_entries (thing_tid, sequence_num);
      CREATE INDEX IF NOT EXISTS provenance_thing_idx ON provenance_entries (thing_tid);

      -- Backfill initial provenance hop for fulfilled paid Mystery Box purchases
      UPDATE provenance_entries pe
      SET via = 'mystery_box_purchase'
      FROM collection_purchases cp
      WHERE pe.thing_tid = cp.thing_tid
        AND pe.sequence_num = 0
        AND cp.status = 'fulfilled'
        AND pe.via = 'daily_pull';

      -- Backfill initial provenance hop for free Mystery Box draws
      UPDATE provenance_entries pe
      SET via = 'mystery_box'
      FROM things t
      WHERE pe.thing_tid = t.thing_tid
        AND pe.sequence_num = 0
        AND t.collection_id IS NOT NULL
        AND pe.via = 'daily_pull';

      CREATE TABLE IF NOT EXISTS escrow_offers (
        offer_tid TEXT PRIMARY KEY,
        thing_tid TEXT NOT NULL REFERENCES things(thing_tid),
        sender_did TEXT NOT NULL REFERENCES users(did),
        recipient_did TEXT NOT NULL,
        recipient_handle_snapshot TEXT NOT NULL,
        recipient_display_name TEXT,
        recipient_avatar_url TEXT,
        note VARCHAR(140),
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        offer_at_uri TEXT,
        offer_at_cid TEXT,
        claim_at_uri TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revocable_after TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS escrow_sender_idx ON escrow_offers (sender_did);
      CREATE INDEX IF NOT EXISTS escrow_recipient_idx ON escrow_offers (recipient_did);
      CREATE INDEX IF NOT EXISTS escrow_thing_idx ON escrow_offers (thing_tid);

      CREATE TABLE IF NOT EXISTS follows (
        follower_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        subject_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        follow_tid TEXT NOT NULL,
        source VARCHAR(24) NOT NULL DEFAULT 'manual',
        at_uri TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower_did, subject_did)
      );
      CREATE INDEX IF NOT EXISTS follows_subject_idx ON follows (subject_did);

      CREATE TABLE IF NOT EXISTS bsky_known_follows (
        follower_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
        target_did TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower_did, target_did)
      );
      CREATE INDEX IF NOT EXISTS bsky_known_target_idx ON bsky_known_follows (target_did);

      CREATE TABLE IF NOT EXISTS feed_events (
        id BIGSERIAL PRIMARY KEY,
        event_type VARCHAR(32) NOT NULL,
        actor_did TEXT NOT NULL REFERENCES users(did),
        target_did TEXT REFERENCES users(did),
        thing_tid TEXT REFERENCES things(thing_tid) ON DELETE CASCADE,
        collection_tid TEXT REFERENCES thing_collections(collection_tid) ON DELETE CASCADE,
        sequence_num INTEGER NOT NULL DEFAULT 0,
        note VARCHAR(140),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE feed_events ALTER COLUMN event_type TYPE VARCHAR(32);
      ALTER TABLE feed_events ALTER COLUMN thing_tid DROP NOT NULL;
      ALTER TABLE feed_events ADD COLUMN IF NOT EXISTS collection_tid TEXT REFERENCES thing_collections(collection_tid) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS feed_events_created_idx ON feed_events (created_at);
      CREATE INDEX IF NOT EXISTS feed_events_actor_idx ON feed_events (actor_did);
      CREATE INDEX IF NOT EXISTS feed_events_target_idx ON feed_events (target_did);
      CREATE INDEX IF NOT EXISTS feed_events_collection_idx ON feed_events (collection_tid);

      -- Backfill feed_events for fulfilled paid Mystery Box purchases
      UPDATE feed_events fe
      SET event_type = 'mystery_box_purchase',
          collection_tid = cp.collection_tid
      FROM collection_purchases cp
      WHERE fe.thing_tid = cp.thing_tid
        AND cp.status = 'fulfilled'
        AND fe.event_type = 'daily_pull';

      -- Backfill feed_events for free Mystery Box draws
      UPDATE feed_events fe
      SET event_type = 'mystery_box',
          collection_tid = t.collection_id
      FROM things t
      WHERE fe.thing_tid = t.thing_tid
        AND t.collection_id IS NOT NULL
        AND fe.event_type = 'daily_pull';

      -- Backfill collection_sold_out event once for any already sold-out Mystery Box collection
      INSERT INTO feed_events (event_type, actor_did, target_did, thing_tid, collection_tid, sequence_num, created_at)
      SELECT 'collection_sold_out', tc.creator_did, NULL, NULL, tc.collection_tid, 0, NOW()
      FROM thing_collections tc
      WHERE NOT EXISTS (
        SELECT 1 FROM things t
        WHERE t.collection_id = tc.collection_tid
          AND t.status IN ('unclaimed', 'reserved')
      )
      AND EXISTS (
        SELECT 1 FROM things t
        WHERE t.collection_id = tc.collection_tid
          AND t.status IN ('held', 'escrowed')
      )
      AND NOT EXISTS (
        SELECT 1 FROM feed_events fe
        WHERE fe.collection_tid = tc.collection_tid
          AND fe.event_type = 'collection_sold_out'
      );

      CREATE TABLE IF NOT EXISTS oauth_states (
        key TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_sessions (
        did TEXT PRIMARY KEY,
        session_json TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_pds_session (
        id TEXT PRIMARY KEY,
        did TEXT NOT NULL,
        session_json TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pending_pds_syncs (
        id BIGSERIAL PRIMARY KEY,
        target_did TEXT NOT NULL,
        action VARCHAR(32) NOT NULL,
        thing_tid TEXT,
        payload JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pending_pds_target_idx ON pending_pds_syncs (target_did);

      CREATE TABLE IF NOT EXISTS subcategory_stats (
        subcategory_key TEXT PRIMARY KEY,
        macro_category TEXT NOT NULL,
        subcategory TEXT NOT NULL,
        pull_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS jetstream_cursor (
        id TEXT PRIMARY KEY,
        time_us TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      SELECT setval(
        pg_get_serial_sequence('things', 'catalog_number'),
        GREATEST(COALESCE((SELECT MAX(catalog_number) FROM things), 1), 1),
        true
      );
    `);

    console.log("[db:migrate] Schema applied successfully!");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[db:migrate] Migration failed:", err);
  process.exit(1);
});
