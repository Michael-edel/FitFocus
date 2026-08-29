// Cloudflare Pages Function: /api/mobile/token
// Exchanges an existing FitFocus web session for a short-lived bearer token
// that a native iOS HealthKit bridge can store in Keychain.

import { requireUser, json } from "../_lib/auth";
import { requireBetaAccess } from "../_lib/access";
import { requireDB, nowMs } from "../_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database; REQUIRE_INVITE?: string };
type MobileSessionPayload = {
  v: number;
  sub: string;
  sid: string;
  email?: string;
  name?: string;
  picture?: string;
  aud?: "mobile";
  iat?: number;
  exp?: number;
};

async function signSessionJwt(payload: MobileSessionPayload, secret: string, ttlSeconds: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + ttlSeconds };
  const enc = new TextEncoder();
  const b64 = (input: string | Uint8Array | ArrayBuffer) => {
    const bytes =
      typeof input === "string"
        ? enc.encode(input)
        : input instanceof Uint8Array
          ? input
          : new Uint8Array(input);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const h = b64(JSON.stringify(header));
  const p = b64(JSON.stringify(full));
  const data = `${h}.${p}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const s = b64(new Uint8Array(sig));
  return `${data}.${s}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  if (!env.AUTH_JWT_SECRET) return json({ error: "AUTH_CONFIG" }, 500);
  const db = requireDB(env);
  const now = nowMs();
  const ttl = 60 * 60 * 24 * 30;

  const session = await db
    .prepare("SELECT id, expires_at, revoked FROM sessions WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(user.sid, user.sub)
    .first<{ id?: string; expires_at?: number; revoked?: number }>();

  if (!session || Number(session.revoked || 0) === 1 || Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000)) {
    return json({ error: "UNAUTH" }, 401);
  }

  const token = await signSessionJwt(
    { v: 2, sub: user.sub, sid: user.sid, email: user.email, name: user.name, picture: user.picture, aud: "mobile", iat: now },
    env.AUTH_JWT_SECRET,
    ttl
  );

  return json(
    {
      token,
      tokenType: "Bearer",
      expiresAt: now + ttl * 1000,
      user: {
        id: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    },
    200
  );
};
