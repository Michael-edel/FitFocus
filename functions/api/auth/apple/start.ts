import type { PagesFunction } from "@cloudflare/workers-types";
import { base64UrlEncode, cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signState } from "../_oauth";

function jsonResponse(body: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export const onRequestGet: PagesFunction<{
  APPLE_CLIENT_ID: string;
  AUTH_JWT_SECRET: string;
  APP_URL?: string;
}> = async ({ request, env }) => {
  if (!env.APPLE_CLIENT_ID) {
    return jsonResponse({ error: "Missing APPLE_CLIENT_ID" }, 500);
  }
  if (!env.AUTH_JWT_SECRET) {
    return jsonResponse({ error: "Missing AUTH_JWT_SECRET" }, 500);
  }

  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "";
  const invite = url.searchParams.get("invite") || "";

  const baseUrl = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
  let redirectUrl = baseUrl;
  if (redirect) {
    try {
      const ru = new URL(redirect);
      if (/^https?:$/.test(ru.protocol) && ru.origin === baseUrl) {
        redirectUrl = ru.origin;
      }
    } catch {}
  }

  const redirectUri = `${baseUrl}/api/auth/apple/callback`;
  const nonce = crypto.randomUUID();
  const rawState = JSON.stringify({ r: redirectUrl, i: invite || undefined, n: nonce, t: Date.now() });
  const sig = await signState(rawState, env.AUTH_JWT_SECRET);
  const state = `${base64UrlEncode(new TextEncoder().encode(rawState))}.${sig}`;

  const auth = new URL("https://appleid.apple.com/auth/authorize");
  auth.searchParams.set("client_id", env.APPLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("response_mode", "form_post");
  auth.searchParams.set("scope", "name email");
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
