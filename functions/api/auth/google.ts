import { ensureAuthSchema, json, replaceActiveSessionsForUser } from "../_lib/auth";
import { consumeInviteCode } from "../_lib/invites";
// Cloudflare Pages Function: /api/auth/google
// Accepts Google Identity Services "credential" (ID token), validates it via Google tokeninfo,
// then issues our own signed session JWT in HttpOnly cookie.

async function safeResponseJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;

    const body = await request.json().catch(() => ({} as any));
    const credential = body?.credential;
    if (!credential || typeof credential !== "string") {
      return json({ error: "Missing credential" }, 400);
    }

    const allowedAud = [
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_ID_LOCAL,
      env.GOOGLE_CLIENT_ID_PROD,
      env.VITE_GOOGLE_CLIENT_ID,
      env.VITE_GOOGLE_CLIENT_ID_LOCAL,
      env.VITE_GOOGLE_CLIENT_ID_PROD,
    ].filter(Boolean) as string[];
    if (allowedAud.length === 0) return json({ error: "Server missing GOOGLE_CLIENT_ID (or *_LOCAL/PROD)" }, 500);
    if (!env.AUTH_JWT_SECRET) return json({ error: "Server missing AUTH_JWT_SECRET" }, 500);

    // Validate token with Google (simple + reliable, no crypto libs needed).
    const tokenInfoUrl = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential);
    const r = await fetch(tokenInfoUrl, { method: "GET" });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "Invalid Google token", details: t.slice(0, 200) }, 401);
    }
    const info: any = await safeResponseJson(r);

    // Basic checks
    if (!allowedAud.includes(String(info.aud || ""))) return json({ error: "Token aud mismatch", aud: info.aud }, 401);
    if (info.iss !== "https://accounts.google.com" && info.iss !== "accounts.google.com") {
      return json({ error: "Token iss mismatch" }, 401);
    }

    const user = {
      sub: String(info.sub || ""),
      email: String(info.email || ""),
      name: String(info.name || info.given_name || ""),
      picture: String(info.picture || ""),
      email_verified: String(info.email_verified || "") === "true",
    };

    const now = Math.floor(Date.now() / 1000);
    if (!env.DB) return json({ error: "Server missing DB binding" }, 500);
    await ensureAuthSchema(env.DB);

    const sid = crypto.randomUUID();
    const ttl = 60 * 60 * 24 * 30; // 30 days
    const expiresAt = now + ttl;

    // Upsert user with profile metadata so admin / profile views stay in sync.
    await env.DB.prepare(
      "INSERT INTO users (id, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=excluded.updated_at"
    )
      .bind(user.sub, user.email, user.name, user.picture, now, now)
      .run();

// Closed beta (invite codes)
const requireInvite = String((env as any).REQUIRE_INVITE || "").trim() === "1";
if (requireInvite) {
  const inviteCode = String(body?.inviteCode || "").trim();
  if (!inviteCode) return json({ error: "INVITE_REQUIRED" }, 403);

  const consumed = await consumeInviteCode(env.DB, inviteCode, user.sub, Math.floor(Date.now() / 1000));
  if (!consumed.ok) {
    return json({ error: "INVITE_INVALID" }, 403);
  }
}

// Restore soft-deleted accounts only after beta/invite access checks pass.
await env.DB.prepare(
  `UPDATE users
   SET deleted_at = NULL, deletion_scheduled_at = NULL, is_active = 1, updated_at = ?
   WHERE id = ?
     AND deleted_at IS NOT NULL
     AND deletion_scheduled_at IS NOT NULL
     AND deletion_scheduled_at > datetime('now')`
)
  .bind(now, user.sub)
  .run();


// Optional: auto-promote admins/supports by email (enterprise convenience)
const adminEmails = String((env as any).ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
if (adminEmails.length && user.email && adminEmails.includes(String(user.email).toLowerCase())) {
  await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(user.sub).run();
}
// Create server-tracked session (enterprise layer)
const ip =
  request.headers.get("cf-connecting-ip") ||
  request.headers.get("x-forwarded-for") ||
  request.headers.get("x-real-ip") ||
  "";

await replaceActiveSessionsForUser(env.DB, user.sub, now);

await env.DB.prepare(
  "INSERT INTO sessions (id, user_id, created_at, expires_at, revoked, user_agent, ip) VALUES (?, ?, ?, ?, 0, ?, ?)"
)
  .bind(sid, user.sub, now, expiresAt, request.headers.get("user-agent")?.slice(0, 500) || "", String(ip).slice(0, 100))
  .run();


    const session = await signSessionJwt(
      {
        v: 2,
        sub: user.sub,
        sid,
        email: user.email,
        name: user.name,
        picture: user.picture,
        iat: now,
      },
      env.AUTH_JWT_SECRET,      ttl
    );

    const headers = new Headers();
    const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_session", session, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "Lax",
        path: "/",
                maxAge: ttl,
      })
    );

    return json({ ok: true, user }, 200, headers);
  } catch (e: any) {
    return json({ error: "Server error", details: String(e?.message || e) }, 500);
  }
};

type Env = {
  AUTH_JWT_SECRET: string;
  DB: any;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID_LOCAL?: string;
  GOOGLE_CLIENT_ID_PROD?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID_LOCAL?: string;
  VITE_GOOGLE_CLIENT_ID_PROD?: string;
};


function cookieSerialize(
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    maxAge?: number;
  }
) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

// --- JWT (HS256) ---
function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

async function signSessionJwt(payload: any, secret: string, ttlSeconds: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: payload?.iat ?? now, exp: now + ttlSeconds };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(full));
  const data = `${h}.${p}`;
  const sig = await hmacSha256(data, secret);
  return `${data}.${sig}`;
}
