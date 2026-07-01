import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { base64UrlEncode, cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signState } from "../../auth/_oauth";
import { buildHuaweiAuthorizeUrl, getHuaweiConfig, type HuaweiHealthEnv } from "../../_lib/huawei_health";

type Env = HuaweiHealthEnv & { DB: D1Database; APP_URL?: string };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const config = getHuaweiConfig(env, request);
  if (config.missing.length) {
    return json({ error: "HUAWEI_CONFIG_MISSING" }, 503);
  }

  requireDB(env);

  const url = new URL(request.url);
  const requestBase = normalizeAppUrl(env.APP_URL) || getBaseUrl(request);
  const redirectParam = url.searchParams.get("redirect") || "";
  let redirectAfter = `${requestBase}/?wearable=huawei_health`;
  if (redirectParam) {
    try {
      const parsed = new URL(redirectParam);
      if (/^https?:$/.test(parsed.protocol) && parsed.origin === requestBase) {
        redirectAfter = parsed.toString();
      }
    } catch {
      redirectAfter = `${requestBase}/?wearable=huawei_health`;
    }
  }

  const nonce = crypto.randomUUID();
  const rawState = JSON.stringify({ u: user.sub, r: redirectAfter, n: nonce, t: Date.now() });
  const sig = await signState(rawState, env.AUTH_JWT_SECRET);
  const state = `${base64UrlEncode(new TextEncoder().encode(rawState))}.${sig}`;
  const authUrl = buildHuaweiAuthorizeUrl(env, request, state);

  const headers = new Headers();
  const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  headers.append(
    "Set-Cookie",
    cookieSerialize("ff_huawei_oauth_nonce", nonce, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "Lax",
      path: "/",
      maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    }),
  );
  headers.set("Location", authUrl.toString());
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
};
