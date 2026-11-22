import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
  requestLocalLock,
} from "@atproto/oauth-client-node";
import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { USER_OAUTH_SCOPES } from "@/lib/lexicons";

const globalForOAuth = globalThis as unknown as {
  oauthClientPromise?: Promise<NodeOAuthClient>;
};

export function getPublicAppUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000").replace(
    /\/+$/,
    ""
  );
  return raw;
}

export function isLoopbackUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return (
      u.hostname === "127.0.0.1" ||
      u.hostname === "localhost" ||
      u.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function buildProductionClientMetadata(appUrl: string, hasPrivateKey: boolean) {
  return {
    client_id: `${appUrl}/oauth-client-metadata.json`,
    client_name: "Give a Thing",
    client_uri: appUrl,
    logo_uri: `${appUrl}/icon.svg`,
    redirect_uris: [`${appUrl}/oauth/callback`] as [string, ...string[]],
    grant_types: ["authorization_code", "refresh_token"] as [
      "authorization_code",
      "refresh_token",
    ],
    response_types: ["code"] as ["code"],
    scope: USER_OAUTH_SCOPES,
    application_type: "web" as const,
    dpop_bound_access_tokens: true,
    token_endpoint_auth_method: hasPrivateKey
      ? ("private_key_jwt" as const)
      : ("none" as const),
    ...(hasPrivateKey
      ? {
          token_endpoint_auth_signing_alg: "ES256" as const,
          jwks_uri: `${appUrl}/jwks.json`,
        }
      : {}),
  };
}

async function createOAuthClient(): Promise<NodeOAuthClient> {
  const appUrl = getPublicAppUrl();
  const loopback = isLoopbackUrl(appUrl);
  const rawJwk = process.env.ATPROTO_OAUTH_PRIVATE_JWK?.trim();

  let keyset: JoseKey[] | undefined;
  if (!loopback && rawJwk) {
    const parsed = JSON.parse(rawJwk);
    const key = await JoseKey.fromImportable(parsed, parsed.kid ?? "gat-key-1");
    keyset = [key];
  }

  const clientMetadata = loopback
    ? buildAtprotoLoopbackClientMetadata({
        scope: USER_OAUTH_SCOPES,
        redirect_uris: [`${appUrl.replace("localhost", "127.0.0.1")}/oauth/callback`],
      })
    : buildProductionClientMetadata(appUrl, Boolean(keyset));

  return new NodeOAuthClient({
    clientMetadata,
    keyset,
    requestLock: requestLocalLock,
    stateStore: {
      async get(key: string): Promise<NodeSavedState | undefined> {
        const db = getDb();
        await db
          .delete(schema.oauthStates)
          .where(lt(schema.oauthStates.expiresAt, new Date()));
        const rows = await db
          .select()
          .from(schema.oauthStates)
          .where(eq(schema.oauthStates.key, key))
          .limit(1);
        if (!rows[0]) return undefined;
        return JSON.parse(rows[0].stateJson) as NodeSavedState;
      },
      async set(key: string, value: NodeSavedState): Promise<void> {
        const db = getDb();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const stateJson = JSON.stringify(value);
        await db
          .insert(schema.oauthStates)
          .values({ key, stateJson, expiresAt })
          .onConflictDoUpdate({
            target: schema.oauthStates.key,
            set: { stateJson, expiresAt },
          });
      },
      async del(key: string): Promise<void> {
        const db = getDb();
        await db
          .delete(schema.oauthStates)
          .where(eq(schema.oauthStates.key, key));
      },
    },
    sessionStore: {
      async get(did: string): Promise<NodeSavedSession | undefined> {
        const db = getDb();
        const rows = await db
          .select()
          .from(schema.oauthSessions)
          .where(eq(schema.oauthSessions.did, did))
          .limit(1);
        if (!rows[0]) return undefined;
        return JSON.parse(rows[0].sessionJson) as NodeSavedSession;
      },
      async set(did: string, value: NodeSavedSession): Promise<void> {
        const db = getDb();
        const sessionJson = JSON.stringify(value);
        await db
          .insert(schema.oauthSessions)
          .values({ did, sessionJson, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.oauthSessions.did,
            set: { sessionJson, updatedAt: new Date() },
          });
      },
      async del(did: string): Promise<void> {
        const db = getDb();
        await db
          .delete(schema.oauthSessions)
          .where(eq(schema.oauthSessions.did, did));
      },
    },
  });
}

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (!globalForOAuth.oauthClientPromise) {
    globalForOAuth.oauthClientPromise = createOAuthClient().catch((err) => {
      globalForOAuth.oauthClientPromise = undefined;
      throw err;
    });
  }
  return globalForOAuth.oauthClientPromise;
}
