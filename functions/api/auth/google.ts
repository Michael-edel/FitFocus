import { ensureAuthSchema, json, replaceActiveSessionsForUser } from "../_lib/auth";
import { consumeInviteCode } from "../_lib/invites";
import { asString, isJsonObject, type JsonObject } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { cookieSerialize, signSessionJwt } from "./_oauth";
// Cloudflare Pages Function: /api/auth/google
// Accepts Google Identity Services "credential" (ID token), validates it via Google tokeninfo,
// then issues our own signed session JWT in HttpOnly cookie.

async function safeResponseJson(response: Response): Promise<JsonObject> {
  const parsed = await response.json().catch(() => null);
  return isJsonObject(parsed) ? parsed : {};
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;

    let body: JsonObject | null = null;
    try {
      body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
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
    const info = await safeResponseJson(r);
    if (!r.ok) {
      const details = String(info?.error_description || info?.error || "");
      return json({ error: "Invalid Google token", details: details.slice(0, 200) }, 401);
    }

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
const requireInvite = String(env.REQUIRE_INVITE || "").trim() === "1";
if (requireInvite) {
  const inviteCode = asString(body?.inviteCode);
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
const adminEmails = asString(env.ADMIN_EMAILS).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
if (user.email_verified && adminEmails.length && user.email && adminEmails.includes(String(user.email).toLowerCase())) {
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: "Server error", details: message }, 500);
  }
};

type Env = {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID_LOCAL?: string;
  GOOGLE_CLIENT_ID_PROD?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID_LOCAL?: string;
  VITE_GOOGLE_CLIENT_ID_PROD?: string;
  REQUIRE_INVITE?: string;
  ADMIN_EMAILS?: string;
};
