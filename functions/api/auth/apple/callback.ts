import type { PagesFunction } from "@cloudflare/workers-types";
import { getBaseUrl, normalizeAppUrl, cookieSerialize, createAppleClientSecret, OAUTH_STATE_TTL_MS, verifyState, signSessionJwt, verifyAppleIdToken } from "../_oauth";
import { ensureAuthSchema, readCookie, replaceActiveSessionsForUser } from "../../_lib/auth";
import { consumeInviteCode } from "../../_lib/invites";
import { asString, isJsonObject, safeJsonParseObject, type JsonObject } from "../../_lib/json";
import { readFormDataRequest, RequestBodyTooLargeError } from "../../_lib/request_body";

type ExistingAppleUserRow = {
  email?: string | null;
  name?: string | null;
  picture?: string | null;
};

const AUTH_UNAVAILABLE = { error: "AUTH_UNAVAILABLE" };
const OAUTH_FORM_BODY_LIMIT_BYTES = 32 * 1024;

function json(body: unknown, status = 200, headers?: Headers) {
  const responseHeaders = headers ? new Headers(headers) : new Headers();
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");
  responseHeaders.set("referrer-policy", "no-referrer");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

async function safeResponseJson(response: Response): Promise<JsonObject> {
  const parsed = await response.json().catch(() => null);
  return isJsonObject(parsed) ? parsed : {};
}

function parseAppleUserField(value: FormDataEntryValue | null): JsonObject | null {
  if (!value || typeof value !== "string") return null;
  return safeJsonParseObject(value);
}

function buildAppleName(userJson: JsonObject | null): string {
  const name = isJsonObject(userJson?.name) ? userJson.name : null;
  const first = String(name?.firstName || "").trim();
  const last = String(name?.lastName || "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

export const onRequest: PagesFunction<{
  DB: D1Database;
  APPLE_CLIENT_ID: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  AUTH_JWT_SECRET: string;
  APP_URL?: string;
  REQUIRE_INVITE?: string;
  ADMIN_EMAILS?: string;
  BOOTSTRAP_ADMIN_EMAILS?: string;
}> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json(AUTH_UNAVAILABLE, 500);
    }
    if (!env.APPLE_CLIENT_ID) {
      return json(AUTH_UNAVAILABLE, 500);
    }
    if (!env.AUTH_JWT_SECRET) {
      return json(AUTH_UNAVAILABLE, 500);
    }

    const url = new URL(request.url);
    let code = url.searchParams.get("code") || "";
    let state = url.searchParams.get("state") || "";
    let appleUserJson: JsonObject | null = null;

    if (request.method === "POST") {
      const form = await readFormDataRequest(request, OAUTH_FORM_BODY_LIMIT_BYTES);
      if (!form) return json({ error: "BAD_REQUEST" }, 400);
      code = String(form.get("code") || code || "");
      state = String(form.get("state") || state || "");
      appleUserJson = parseAppleUserField(form.get("user"));
    }

    if (!code) return json({ error: "Missing code" }, 400);
    const oauthNonce = readCookie(request.headers.get("Cookie") || "", "ff_oauth_nonce");
    const parsed = await verifyState(state, env.AUTH_JWT_SECRET, {
      expectedNonce: oauthNonce,
      maxAgeMs: OAUTH_STATE_TTL_MS,
    });
    if (!parsed?.r || !parsed?.n) return json({ error: "Missing/invalid state" }, 400);

    const requestBase = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
    let redirectAfter = requestBase;
    try {
      const redirectCandidate = asString(parsed.r);
      const ru = new URL(redirectCandidate);
      if (/^https?:$/.test(ru.protocol) && ru.origin === requestBase) {
        redirectAfter = ru.origin;
      }
    } catch {}
    const inviteCode = asString(parsed?.i);

    const baseUrl = requestBase;
    const redirectUri = `${baseUrl}/api/auth/apple/callback`;

    const clientSecret = await createAppleClientSecret(env);
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.APPLE_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await safeResponseJson(tokenRes);
    if (!tokenRes.ok) {
      return json({ error: "Token exchange failed" }, 502);
    }
    const idToken = tokenJson.id_token as string | undefined;
    if (!idToken) return json({ error: "No id_token returned" }, 502);

    const idPayload = await verifyAppleIdToken(idToken, env.APPLE_CLIENT_ID);
    if (!idPayload) return json({ error: "Invalid id_token signature or claims" }, 400);
    const now = Math.floor(Date.now() / 1000);

    const appleSub = String(idPayload.sub || "");
    if (!appleSub) return json({ error: "Missing sub" }, 400);

    const existing = await env.DB.prepare("SELECT email, name, picture FROM users WHERE id = ? LIMIT 1")
      .bind(appleSub)
      .first<ExistingAppleUserRow>();

    const tokenEmail = String(idPayload.email || "");
    const tokenEmailVerified = idPayload.email_verified === true || idPayload.email_verified === "true";
    const verifiedTokenEmail = tokenEmailVerified ? tokenEmail : "";
    const formEmail = String(appleUserJson?.email || "");
    const appleName = buildAppleName(appleUserJson);
    const nextEmail = tokenEmail || formEmail || String(existing?.email || "");
    const nextName =
      appleName ||
      String(existing?.name || "").trim() ||
      (nextEmail ? nextEmail.split("@")[0] : "") ||
      "Apple User";
    const nextPicture = String(existing?.picture || "");

    await ensureAuthSchema(env.DB);
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, picture, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=excluded.updated_at`
    )
      .bind(appleSub, nextEmail, nextName, nextPicture, now, now)
      .run();

    const requireInvite = String(env.REQUIRE_INVITE || "").trim() === "1";
    if (requireInvite && !inviteCode) {
      return Response.redirect(`${baseUrl}/?invite_error=required`, 302);
    }

    if (inviteCode) {
      const consumed = await consumeInviteCode(env.DB, inviteCode, appleSub, now);
      if (!consumed.ok) {
        return Response.redirect(`${baseUrl}/?invite_error=invalid`, 302);
      }
    }

    await env.DB.prepare(
      `UPDATE users
       SET deleted_at = NULL, deletion_scheduled_at = NULL, is_active = 1, updated_at = ?
       WHERE id = ?
         AND deleted_at IS NOT NULL
         AND deletion_scheduled_at IS NOT NULL
         AND deletion_scheduled_at > datetime('now')`
    )
      .bind(now, appleSub)
      .run();

    const adminEmails = String(env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.length && verifiedTokenEmail && adminEmails.includes(verifiedTokenEmail.toLowerCase())) {
      await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(appleSub).run();
    }

    const bootstrapEmails = String(env.BOOTSTRAP_ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (bootstrapEmails.length && verifiedTokenEmail) {
      const anyAdmin = await env.DB.prepare("SELECT 1 FROM user_roles WHERE role='admin' LIMIT 1").first();
      if (!anyAdmin && bootstrapEmails.includes(verifiedTokenEmail.toLowerCase())) {
        await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(appleSub).run();
      }
    }

    const sid = crypto.randomUUID();
    const ttl = 60 * 60 * 24 * 30;
    const expiresAt = now + ttl;
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    await replaceActiveSessionsForUser(env.DB, appleSub, now);
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at, revoked, user_agent, ip) VALUES (?, ?, ?, ?, 0, ?, ?)"
    )
      .bind(sid, appleSub, now, expiresAt, request.headers.get("user-agent")?.slice(0, 500) || "", String(ip).slice(0, 100))
      .run();

    const sessionJwt = await signSessionJwt(
      { v: 2, sub: appleSub, sid, email: nextEmail, name: nextName, picture: nextPicture, iat: now },
      env.AUTH_JWT_SECRET,
      ttl
    );

    const headers = new Headers();
    const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_session", sessionJwt, { httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: ttl })
    );
    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_oauth_nonce", "", { httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: 0 })
    );
    headers.set("Location", `${redirectAfter}/?auth=apple`);
    return new Response(null, { status: 302, headers });
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
    }
    return json({ error: "Server error" }, 500);
  }
};
