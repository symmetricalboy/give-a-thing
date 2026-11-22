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
      DROP INDEX IF EXISTS things_discoverer_utc_date_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS things_discoverer_utc_date_slot_idx ON things (discoverer_did, pull_utc_date, pull_slot);
      CREATE INDEX IF NOT EXISTS things_embedding_hnsw_idx ON things USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS things_owner_idx ON things (current_owner_did);
      CREATE INDEX IF NOT EXISTS things_category_idx ON things (category);
      CREATE INDEX IF NOT EXISTS things_transfer_count_idx ON things (transfer_count);
      CREATE INDEX IF NOT EXISTS things_created_at_idx ON things (created_at);

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
        via VARCHAR(24) NOT NULL,
        note VARCHAR(140),
        ledger_at_uri TEXT,
        ledger_at_cid TEXT,
        user_proof_at_uri TEXT,
        user_proof_at_cid TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS provenance_thing_seq_idx ON provenance_entries (thing_tid, sequence_num);
      CREATE INDEX IF NOT EXISTS provenance_thing_idx ON provenance_entries (thing_tid);

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
        event_type VARCHAR(24) NOT NULL,
        actor_did TEXT NOT NULL REFERENCES users(did),
        target_did TEXT REFERENCES users(did),
        thing_tid TEXT NOT NULL REFERENCES things(thing_tid),
        sequence_num INTEGER NOT NULL DEFAULT 0,
        note VARCHAR(140),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS feed_events_created_idx ON feed_events (created_at);
      CREATE INDEX IF NOT EXISTS feed_events_actor_idx ON feed_events (actor_did);
      CREATE INDEX IF NOT EXISTS feed_events_target_idx ON feed_events (target_did);

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
