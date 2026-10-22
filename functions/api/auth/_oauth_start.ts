import { base64UrlEncode, cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signState } from "./_oauth";

const AUTH_UNAVAILABLE = { error: "AUTH_UNAVAILABLE" };
type OAuthStartEnv = { AUTH_JWT_SECRET: string; APP_URL?: string };
type OAuthStartInput = { request: Request; env: OAuthStartEnv; clientId: string | undefined; authorizationUrl: string; callbackPath: string; scope: string; extraParams?: Record<string, string> };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

/** Creates an OAuth redirect with a signed, short-lived state and matching nonce cookie. */
export async function startOAuthAuthorization(input: OAuthStartInput): Promise<Response> {
  const { request, env, clientId, authorizationUrl, callbackPath, scope, extraParams } = input;
  if (!clientId || !env.AUTH_JWT_SECRET) return jsonResponse(AUTH_UNAVAILABLE, 500);

  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "";
  const invite = url.searchParams.get("invite") || "";
  const baseUrl = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
  let redirectUrl = baseUrl;
  if (redirect) {
    try {
      const requestedRedirect = new URL(redirect);
      if (/^https?:$/.test(requestedRedirect.protocol) && requestedRedirect.origin === baseUrl) redirectUrl = requestedRedirect.origin;
    } catch {
      // Keep the request origin for malformed redirect parameters.
    }
  }

  const nonce = crypto.randomUUID();
  const rawState = JSON.stringify({ r: redirectUrl, i: invite || undefined, n: nonce, t: Date.now() });
  const signature = await signState(rawState, env.AUTH_JWT_SECRET);
  const state = `${base64UrlEncode(new TextEncoder().encode(rawState))}.${signature}`;
  const auth = new URL(authorizationUrl);
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", `${baseUrl}${callbackPath}`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", scope);
  auth.searchParams.set("state", state);
  for (const [key, value] of Object.entries(extraParams ?? {})) auth.searchParams.set(key, value);

  const headers = new Headers();
  const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  headers.append("Set-Cookie", cookieSerialize("ff_oauth_nonce", nonce, { httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000) }));
  headers.set("Location", auth.toString());
  return new Response(null, { status: 302, headers });
}
