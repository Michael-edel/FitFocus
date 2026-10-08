import type { PagesFunction } from "@cloudflare/workers-types";
import { getBaseUrl, normalizeAppUrl, cookieSerialize, createAppleClientSecret, OAUTH_STATE_TTL_MS, verifyState, signSessionJwt, verifyAppleIdToken } from "../_oauth";
import { ensureAuthSchema, readCookie } from "../../_lib/auth";
import { completeAppleLogin } from "../../_lib/apple_login";
import { asString, isJsonObject, safeJsonParseObject, type JsonObject } from "../../_lib/json";
import { readFormDataRequest, RequestBodyTooLargeError } from "../../_lib/request_body";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";

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

const handleAppleOAuthCallback: PagesFunction<{
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
    const appleName = buildAppleName(appleUserJson);
    // Apple's form field is browser-supplied and is not identity evidence. Only
    // a verified ID-token email may replace the account email.
    const nextEmail = verifiedTokenEmail || String(existing?.email || "");
    const nextName =
      appleName ||
      String(existing?.name || "").trim() ||
      (nextEmail ? nextEmail.split("@")[0] : "") ||
      "Apple User";
    const nextPicture = String(existing?.picture || "");

    await ensureAuthSchema(env.DB);
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    const login = await completeAppleLogin({
      db: env.DB,
      user: { sub: appleSub, email: nextEmail, name: nextName, picture: nextPicture, emailVerified: tokenEmailVerified },
      inviteCode,
      now,
      requireInvite: String(env.REQUIRE_INVITE || "").trim() === "1",
      adminEmails: env.ADMIN_EMAILS,
      bootstrapAdminEmails: env.BOOTSTRAP_ADMIN_EMAILS,
      userAgent: request.headers.get("user-agent") || "",
      ip: String(ip),
    });
    if (login.kind === "invite-required") return Response.redirect(`${baseUrl}/?invite_error=required`, 302);
    if (login.kind === "invalid-invite") return Response.redirect(`${baseUrl}/?invite_error=invalid`, 302);
    const ttl = 60 * 60 * 24 * 30;

    const sessionJwt = await signSessionJwt(
      { v: 2, sub: appleSub, sid: login.sid, email: nextEmail, email_verified: tokenEmailVerified, name: nextName, picture: nextPicture, iat: now },
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

/** Records only the OAuth callback outcome; credentials and identity data stay private. */
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
}> = async (context) => {
  const response = await handleAppleOAuthCallback(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.apple.callback.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
