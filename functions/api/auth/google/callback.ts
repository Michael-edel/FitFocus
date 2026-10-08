import type { PagesFunction } from "@cloudflare/workers-types";
import { ensureAuthSchema, readCookie } from "../../_lib/auth";
import { completeGoogleLogin } from '../../_lib/google_login';
import { isJsonObject } from "../../_lib/json";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";
import { cookieSerialize, fetchOAuthProvider, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signSessionJwt, verifyState } from "../_oauth";

type GoogleTokenResponse = { id_token?: string };
type GoogleTokenInfoResponse = {
  aud?: string;
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  picture?: string;
  email_verified?: string | boolean;
};

const AUTH_UNAVAILABLE = { error: "AUTH_UNAVAILABLE" };

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

async function safeResponseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

const handleGoogleOAuthCallback: PagesFunction<{
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_JWT_SECRET: string;
  APP_URL?: string;
  REQUIRE_INVITE?: string;
  ADMIN_EMAILS?: string;
  BOOTSTRAP_ADMIN_EMAILS?: string;
}> = async ({ request, env }) => {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return json(AUTH_UNAVAILABLE, 500);
    }
    if (!env.AUTH_JWT_SECRET) {
      return json(AUTH_UNAVAILABLE, 500);
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "";
    if (!code) return json({ error: "Missing code" }, 400);
    const oauthNonce = readCookie(request.headers.get("Cookie") || "", "ff_oauth_nonce");
    const parsed = await verifyState(state, env.AUTH_JWT_SECRET, {
      expectedNonce: oauthNonce,
      maxAgeMs: OAUTH_STATE_TTL_MS,
    }) as { r: string; i?: string; n: string; t: number } | null;
    if (!parsed) return json({ error: "Invalid state" }, 400);
    const requestBase = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
    let redirectAfter = requestBase;
    if (parsed?.r) {
      try {
        const ru = new URL(parsed.r);
        if (/^https?:$/.test(ru.protocol) && ru.origin === requestBase) {
          redirectAfter = ru.origin;
        }
      } catch {
        redirectAfter = requestBase;
      }
    }
    const inviteCode = parsed?.i || "";

    const baseUrl = requestBase;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code -> tokens
    const tokenRes = await fetchOAuthProvider("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJsonRaw = await safeResponseJson(tokenRes);
    const tokenJson: GoogleTokenResponse = isJsonObject(tokenJsonRaw) ? tokenJsonRaw : {};
    if (!tokenRes.ok) {
      return json({ error: "Token exchange failed" }, 502);
    }
    const idToken = typeof tokenJson.id_token === "string" ? tokenJson.id_token : undefined;
    if (!idToken) return json({ error: "No id_token returned" }, 502);

    // Validate token + get profile
    const infoRes = await fetchOAuthProvider(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const infoRaw = await safeResponseJson(infoRes);
    const info: GoogleTokenInfoResponse = isJsonObject(infoRaw) ? infoRaw : {};
    if (!infoRes.ok) return json({ error: "tokeninfo failed" }, 502);
    if (info.aud !== env.GOOGLE_CLIENT_ID) return json({ error: "Invalid aud" }, 400);

    const user = {
      sub: String(info.sub),
      email: String(info.email || ""),
      name: String(info.name || info.given_name || ""),
      picture: String(info.picture || ""),
      email_verified: info.email_verified === "true" || info.email_verified === true,
    };

    const now = Math.floor(Date.now() / 1000);
    await ensureAuthSchema(env.DB);
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    const login = await completeGoogleLogin({ db: env.DB, user, inviteCode, now, requireInvite: String(env.REQUIRE_INVITE || '').trim() === '1', adminEmails: env.ADMIN_EMAILS, bootstrapAdminEmails: env.BOOTSTRAP_ADMIN_EMAILS, userAgent: request.headers.get('user-agent') || '', ip: String(ip) });
    if (login.kind === 'invite-required') return Response.redirect(`${baseUrl}/?invite_error=required`, 302);
    if (login.kind === 'invalid-invite') return Response.redirect(`${baseUrl}/?invite_error=invalid`, 302);
    const ttl = 60 * 60 * 24 * 30;

    const sessionJwt = await signSessionJwt(
      { v: 2, sub: user.sub, sid: login.sid, email: user.email, email_verified: user.email_verified, name: user.name, picture: user.picture, iat: now },
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
    headers.set("Location", `${redirectAfter}/?auth=google`);
    return new Response(null, { status: 302, headers });
  } catch {
    return json({ error: "Server error" }, 500);
  }
};

/** Records only the OAuth callback outcome; credentials and identity data stay private. */
export const onRequestGet: PagesFunction<{
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_JWT_SECRET: string;
  APP_URL?: string;
  REQUIRE_INVITE?: string;
  ADMIN_EMAILS?: string;
  BOOTSTRAP_ADMIN_EMAILS?: string;
}> = async (context) => {
  const response = await handleGoogleOAuthCallback(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.google.callback.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
