import { base64UrlEncode, cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signState } from "../_oauth";
import type { PagesFunction } from "@cloudflare/workers-types";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

// Classic OAuth2 redirect flow (works across browsers; avoids FedCM).
// GET /api/auth/google/start?redirect=<origin>&invite=<code>

export const onRequestGet: PagesFunction<{
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  AUTH_JWT_SECRET: string;
  APP_URL?: string;
}> = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID) {
    return jsonResponse({ error: "Missing GOOGLE_CLIENT_ID" }, 500);
  }
  if (!env.AUTH_JWT_SECRET) {
    return jsonResponse({ error: "Missing AUTH_JWT_SECRET" }, 500);
  }

  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "";
  const invite = url.searchParams.get("invite") || "";

  // We allow only same-origin style redirects to reduce abuse.
  // In local dev: http://localhost:5173 or http://127.0.0.1:5173
  // In prod: your app origin.
  const baseUrl = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
  let redirectUrl = baseUrl;
  if (redirect) {
    try {
      const ru = new URL(redirect);
      if (/^https?:$/.test(ru.protocol) && ru.origin === baseUrl) {
        redirectUrl = ru.origin;
      }
    } catch {
      // fallback to request origin
    }
  }

  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const nonce = crypto.randomUUID();
  const rawState = JSON.stringify({ r: redirectUrl, i: invite || undefined, n: nonce, t: Date.now() });
  const sig = await signState(rawState, env.AUTH_JWT_SECRET);
  const state = base64UrlEncode(new TextEncoder().encode(rawState)) + "." + sig;

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("prompt", "select_account");
  auth.searchParams.set("access_type", "online");
  auth.searchParams.set("state", state);

  const headers = new Headers();
  const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  headers.append(
    "Set-Cookie",
    cookieSerialize("ff_oauth_nonce", nonce, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "Lax",
      path: "/",
      maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    }),
  );
  headers.set("Location", auth.toString());
  return new Response(null, { status: 302, headers });
};
