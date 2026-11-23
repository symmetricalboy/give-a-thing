import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "gat_session";

export interface SessionPayload {
  did: string;
  handle: string;
}

const DEV_FALLBACK_SESSION_SECRET =
  "dev-only-fallback-secret-replace-in-production-32b";

function getSecretKey(): Uint8Array {
  const configured = process.env.SESSION_SECRET?.trim();
  if (
    !configured ||
    configured === "replace-with-a-secure-random-32-byte-hex-secret" ||
    configured === DEV_FALLBACK_SESSION_SECRET
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET environment variable must be configured in production."
      );
    }
    return new TextEncoder().encode(DEV_FALLBACK_SESSION_SECRET);
  }
  return new TextEncoder().encode(configured);
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return await new SignJWT({ did: payload.did, handle: payload.handle })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.did === "string" && typeof payload.handle === "string") {
      return { did: payload.did, handle: payload.handle };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  return await verifySessionToken(raw);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
