const BSKY_PUBLIC_API = "https://public.api.bsky.app/xrpc";

export interface BlueskyActorSummary {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export async function resolveActorProfile(
  actor: string
): Promise<BlueskyActorSummary | null> {
  const clean = actor.trim().replace(/^@/, "");
  if (!clean) return null;

  try {
    const url = new URL(`${BSKY_PUBLIC_API}/app.bsky.actor.getProfile`);
    url.searchParams.set("actor", clean);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
    return {
      did: data.did,
      handle: data.handle,
      displayName: data.displayName,
      avatar: data.avatar,
    };
  } catch {
    return null;
  }
}

export async function searchBlueskyActors(
  query: string,
  limit = 10
): Promise<BlueskyActorSummary[]> {
  const clean = query.trim().replace(/^@/, "");
  if (!clean) return [];

  try {
    const url = new URL(
      `${BSKY_PUBLIC_API}/app.bsky.actor.searchActorsTypeahead`
    );
    url.searchParams.set("q", clean);
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 25)));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      actors?: Array<{
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      }>;
    };
    return (data.actors ?? []).map((a) => ({
      did: a.did,
      handle: a.handle,
      displayName: a.displayName,
      avatar: a.avatar,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches accounts that `actorDid` follows on Bluesky (up to `maxPages * 100` accounts).
 */
export async function fetchAllBlueskyFollows(
  actorDid: string,
  maxPages = 20
): Promise<BlueskyActorSummary[]> {
  const results: BlueskyActorSummary[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${BSKY_PUBLIC_API}/app.bsky.graph.getFollows`);
    url.searchParams.set("actor", actorDid);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) break;

    const data = (await res.json()) as {
      cursor?: string;
      follows?: Array<{
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      }>;
    };

    for (const f of data.follows ?? []) {
      results.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName,
        avatar: f.avatar,
      });
    }

    if (!data.cursor || (data.follows?.length ?? 0) === 0) break;
    cursor = data.cursor;
  }

  return results;
}

/**
 * Fetches Bluesky followers of a newly registered player so any existing Give a Thing
 * player who follows them on Bluesky AND enabled `auto_import_bsky_follows` auto-follows them!
 */
export async function fetchBlueskyFollowers(
  actorDid: string,
  maxPages = 15
): Promise<BlueskyActorSummary[]> {
  const results: BlueskyActorSummary[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${BSKY_PUBLIC_API}/app.bsky.graph.getFollowers`);
    url.searchParams.set("actor", actorDid);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) break;

    const data = (await res.json()) as {
      cursor?: string;
      followers?: Array<{
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      }>;
    };

    for (const f of data.followers ?? []) {
      results.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName,
        avatar: f.avatar,
      });
    }

    if (!data.cursor || (data.followers?.length ?? 0) === 0) break;
    cursor = data.cursor;
  }

  return results;
}
