import type { PagesFunction } from "@cloudflare/workers-types";
import { json, type SessionUser } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { base64UrlEncode, cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signState } from "../../auth/_oauth";
import { buildHuaweiAuthorizeUrl, getHuaweiConfig, type HuaweiHealthEnv } from "../../_lib/huawei_health";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../../_lib/request_body";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";
import { requireStateUser, stateSessionId, withSessionGuard } from "../../_lib/state_session";

type Env = HuaweiHealthEnv & { DB: D1Database; APP_URL?: string };

async function buildHuaweiStart(request: Request, env: Env, user: SessionUser, redirectParam: string, asJson: boolean) {
  const config = getHuaweiConfig(env, request);
  if (config.missing.length) return json({ error: "HUAWEI_CONFIG_MISSING" }, 503);
  requireDB(env);

  const requestBase = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
  let redirectAfter = `${requestBase}/?wearable=huawei_health`;
  if (redirectParam) {
    try {
      const parsed = new URL(redirectParam);
      if (/^https?:$/.test(parsed.protocol) && parsed.origin === requestBase) redirectAfter = parsed.toString();
    } catch {
      redirectAfter = `${requestBase}/?wearable=huawei_health`;
    }
  }

  const nonce = crypto.randomUUID();
  // Bind the OAuth round trip to the login that initiated it. A later callback
  // cannot connect Huawei after the browser has switched account or session.
  const rawState = JSON.stringify({ u: user.sub, s: await stateSessionId(user), r: redirectAfter, n: nonce, t: Date.now() });
  const sig = await signState(rawState, env.AUTH_JWT_SECRET);
  const state = `${base64UrlEncode(new TextEncoder().encode(rawState))}.${sig}`;
  const authUrl = buildHuaweiAuthorizeUrl(env, request, state);

  const headers = new Headers();
  const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  headers.append("Set-Cookie", cookieSerialize("ff_huawei_oauth_nonce", nonce, {
    httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
  }));
  headers.set("cache-control", "no-store");
  if (asJson) return json({ authorizeUrl: authUrl.toString() }, 200, headers);
  headers.set("Location", authUrl.toString());
  return new Response(null, { status: 302, headers });
}

const handleHuaweiOAuthStartGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireStateUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  const redirect = new URL(request.url).searchParams.get("redirect") || "";
  return buildHuaweiStart(request, env, user, redirect, false);
};

const handleHuaweiOAuthStartPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireStateUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  let body: unknown = {};
  try { body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES); }
  catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
  }
  const redirect = body && typeof body === 'object' && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).redirect === 'string'
    ? (body as Record<string, string>).redirect : '';
  return buildHuaweiStart(request, env, user, redirect, true);
};

async function respond(context: Parameters<PagesFunction<Env>>[0], handler: PagesFunction<Env>) {
  const response = await handler(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("wearable.huawei.start.response", { requestId, status: response.status });
  return withSessionGuard(withRequestId(response, requestId), context.request, 'Huawei');
}

/** Legacy redirect entry point remains available to older clients. */
export const onRequestGet: PagesFunction<Env> = (context) => respond(context, handleHuaweiOAuthStartGet);
/** Session-scoped JSON entry point used by the current Settings screen. */
export const onRequestPost: PagesFunction<Env> = (context) => respond(context, handleHuaweiOAuthStartPost);
