import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json, readCookie } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, verifyState } from "../../auth/_oauth";
import { ensureHuaweiConnectionsSchema, encryptHuaweiTokenSet, exchangeHuaweiCode, huaweiProviderId, type HuaweiHealthEnv } from "../../_lib/huawei_health";
import { connectHuaweiProfile } from '../../_lib/huawei_connect';
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";

type Env = HuaweiHealthEnv & { DB: D1Database; APP_URL?: string };

const handleHuaweiOAuthCallback: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code) return json({ error: "Missing code" }, 400);

    let user;
    try {
      user = await requireUser(request, env);
      await requireBetaAccess(env, user);
    } catch {
      return json({ error: "UNAUTH" }, 401);
    }

    const oauthNonce = readCookie(request.headers.get("Cookie") || "", "ff_huawei_oauth_nonce");
    const parsed = await verifyState(state, env.AUTH_JWT_SECRET, {
      expectedNonce: oauthNonce,
      maxAgeMs: OAUTH_STATE_TTL_MS,
    }) as { u?: string; r?: string; n?: string; t?: number } | null;
    if (!parsed || parsed.u !== user.sub) return json({ error: "Invalid state" }, 400);

    const db = requireDB(env);
    await ensureHuaweiConnectionsSchema(db);
    const tokenSet = await exchangeHuaweiCode(env, request, code);
    const encrypted = await encryptHuaweiTokenSet(env, request, tokenSet);
    const now = Math.floor(Date.now() / 1000);
    const connection = await connectHuaweiProfile({ db, user, tokenSet, encrypted, nowSeconds: now });
    if (connection.kind === 'conflict') return json({ error: 'PROFILE_CONFLICT', profile: connection.profile, version: connection.version }, 409);

    const requestBase = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
    let redirectAfter = `${requestBase}/?wearable=huawei_health&connected=1`;
    if (parsed.r) {
      try {
        const parsedRedirect = new URL(parsed.r);
        if (/^https?:$/.test(parsedRedirect.protocol) && parsedRedirect.origin === requestBase) {
          parsedRedirect.searchParams.set("wearable", "huawei_health");
          parsedRedirect.searchParams.set("connected", "1");
          redirectAfter = parsedRedirect.toString();
        }
      } catch {
        redirectAfter = `${requestBase}/?wearable=huawei_health&connected=1`;
      }
    }

    const headers = new Headers();
    const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_huawei_oauth_nonce", "", { httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: 0 }),
    );
    headers.set("Location", redirectAfter);
    headers.set("cache-control", "no-store");
    return new Response(null, { status: 302, headers });
  } catch {
    return json({ error: "HUAWEI_CALLBACK_FAILED" }, 502);
  }
};

/** Records only the connection callback outcome; codes, state, tokens, and profile data stay private. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleHuaweiOAuthCallback(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("wearable.huawei.callback.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
