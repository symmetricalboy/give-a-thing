# Give a Thing (`giveathing.com`)

A wonderfully pointless daily social game on **ATProtocol**.

Every day (resetting at **00:00 UTC**), every player clicks a button to get **one completely unique, never-duplicated thing** generated on the fly by **Gemini 4 Carbon** with a crisp **16-bit RPG inventory sprite** (`gemini-nano-banana-2.1` + SNES RGB555 pixel post-processing). Things have zero practical value—players simply trade and give things away to friends forever, featuring their **Top 8 favorite things** on their profile and etching notes onto each thing's indestructible provenance ledger across ATProtocol PDSes.

---

## Architecture Highlights

- **Immutable Genesis in App PDS (`@giveathing.com`)**: Canonical `com.giveathing.thing` and `com.giveathing.ledger` records live in Give a Thing's official ATProtocol repository so no player can ever delete or alter a thing once created.
- **ATmosphere Games Directory Indexing (`games.atmosphere.define`)**: Automatically publishes `at://<app_did>/games.atmosphere.define/giveathing` so Give a Thing is indexed in the `atmosphere.games` game library.
- **Decentralized Player Collections & Top 8 Favorites**: Every player (including original discoverers) receives `com.giveathing.holding` records in their own PDS, showcases everything they own on `/u/[handle]` with `com.giveathing.favorite` records powering their **Featured Top 8** display at the top, signs `com.giveathing.transfer` / `com.giveathing.offer` / `com.giveathing.claim` records, and keeps portable `com.giveathing.graph.follow` edges.
- **Minimal OAuth Scopes + Composer Intent**: Requests only `com.giveathing.*` + `blob:image/png` scopes. Non-user Bluesky gift invites use `bsky.app/intent/compose` with dynamic `1200×630` OpenGraph cards and a 24-hour escrow revocation lock.
- **Unlimited Pulls for `@giveathing.com`**: Signing in as `@giveathing.com` unlocks unlimited pulls with no once-a-day cap for testing.
- **Bluesky Avatar Asset**: Circle-crop-safe `1024×1024` pixel avatar PNG is located at `public/avatar.png` (and served at `/avatar.png`).

---

## Local Development

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (PostgreSQL with `pgvector`), `GEMINI_API_KEY`, and `SESSION_SECRET`:
   ```bash
   cp .env.example .env
   ```
2. Bootstrap PostgreSQL (`pgvector` extension + tables & HNSW index):
   ```bash
   npm run db:migrate
   ```
3. Start the loopback dev server on `http://127.0.0.1:3000` (required by ATProtocol Loopback OAuth):
   ```bash
   npm run dev
   ```
