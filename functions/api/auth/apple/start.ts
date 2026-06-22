import type { PagesFunction } from "@cloudflare/workers-types";
import { base64UrlEncode, getBaseUrl, normalizeAppUrl, signState } from "../_oauth";

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

  return Response.redirect(auth.toString(), 302);
};
