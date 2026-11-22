const BSKY_PUBLIC_API = "https://public.api.bsky.app/xrpc";

export interface BlueskyActorSummary {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface BlueskyProfileLink {
  url: string;
  title: string;
  icon: string | null;
}

export interface BlueskyRichProfile {
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
  banner: string | null;
  pronouns: string | null;
  bio: string | null;
  links: BlueskyProfileLink[];
  bskyProfileUrl: string;
}

function normalizeSafeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function fetchRichBlueskyProfile(
  actor: string
): Promise<BlueskyRichProfile | null> {
  const clean = actor.trim().replace(/^@/, "");
  if (!clean) return null;

  try {
    const url = new URL(`${BSKY_PUBLIC_API}/app.bsky.actor.getProfile`);
    url.searchParams.set("actor", clean);
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
      banner?: string;
      pronouns?: string;
      website?: string;
      description?: string;
      links?: Array<{
        url?: string;
        title?: string;
        icon?: string;
      }>;
    };

    const seenUrls = new Set<string>();
    const links: BlueskyProfileLink[] = [];

    const addLink = (rawUrl?: string | null, title?: string | null, icon?: string | null) => {
      const safe = normalizeSafeUrl(rawUrl);
      if (!safe) return;
      const key = safe.replace(/\/+$/, "").toLowerCase();
      if (seenUrls.has(key)) return;
      seenUrls.add(key);

      let fallbackTitle = safe;
      try {
        const parsed = new URL(safe);
        fallbackTitle = parsed.hostname.replace(/^www\./i, "") + (parsed.pathname !== "/" ? parsed.pathname : "");
      } catch {
        // Keep raw safe URL
      }

      links.push({
        url: safe,
        title: title?.trim() || fallbackTitle,
        icon: normalizeSafeUrl(icon),
      });
    };

    if (Array.isArray(data.links)) {
      for (const l of data.links) {
        addLink(l.url, l.title, l.icon);
      }
    }

    if (data.website) {
      addLink(data.website, null, null);
    }

    if (data.description) {
      const urlMatches = data.description.match(/https?:\/\/[^\s<>)"']+/gi) ?? [];
      for (const match of urlMatches) {
        addLink(match.replace(/[.,;:!?]+$/, ""), null, null);
      }
    }

    return {
      did: data.did,
      handle: data.handle,
      displayName: data.displayName?.trim() || null,
      avatar: normalizeSafeUrl(data.avatar),
      banner: normalizeSafeUrl(data.banner),
      pronouns: data.pronouns?.trim() || null,
      bio: data.description?.trim() || null,
      links,
      bskyProfileUrl: `https://bsky.app/profile/${encodeURIComponent(data.handle)}`,
    };
  } catch {
    return null;
  }
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
