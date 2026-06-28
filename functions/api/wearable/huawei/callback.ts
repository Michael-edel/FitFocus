import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json, readCookie } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, verifyState } from "../../auth/_oauth";
import { encryptHuaweiTokenSet, exchangeHuaweiCode, huaweiProviderId, type HuaweiHealthEnv } from "../../_lib/huawei_health";
import { safeJsonParseObject, type JsonObject } from "../../_lib/json";
import { withProtectedFields } from "../../_lib/legacy_sync";
import { loadActivePlan } from "../../_lib/plans";

type Env = HuaweiHealthEnv & { DB: D1Database; APP_URL?: string };

async function loadProfile(db: D1Database, userId: string): Promise<{ profile: JsonObject; version: number }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();
  return {
    profile: row?.profile_json ? (safeJsonParseObject(String(row.profile_json)) || {}) : {},
    version: Number(row?.version || 0),
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
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
    const tokenSet = await exchangeHuaweiCode(env, request, code);
    const encrypted = await encryptHuaweiTokenSet(env, request, tokenSet);
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const provider = huaweiProviderId();
    await db
      .prepare(
        "INSERT INTO wearable_connections " +
          "(id, user_id, provider, access_token_enc, refresh_token_enc, token_type, scope, expires_at, created_at, updated_at, status, metadata_json) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?) " +
          "ON CONFLICT(user_id, provider) DO UPDATE SET " +
          "access_token_enc = excluded.access_token_enc, " +
          "refresh_token_enc = COALESCE(excluded.refresh_token_enc, wearable_connections.refresh_token_enc), " +
          "token_type = excluded.token_type, scope = excluded.scope, expires_at = excluded.expires_at, " +
          "updated_at = excluded.updated_at, status = 'connected', metadata_json = excluded.metadata_json"
      )
      .bind(
        id,
        user.sub,
        provider,
        encrypted.accessTokenEnc,
        encrypted.refreshTokenEnc,
        tokenSet.tokenType,
        tokenSet.scope,
        tokenSet.expiresAt,
        now,
        now,
        JSON.stringify({ connectedAt: new Date(now * 1000).toISOString() }),
      )
      .run();

    const current = await loadProfile(db, user.sub);
    const version = current.version + 1;
    const timestamp = new Date(now * 1000).toISOString();
    const plan = await loadActivePlan(db, user.sub);
    const nextProfile = withProtectedFields(user, {
      ...current.profile,
      plan,
      version,
      wearableProvider: provider,
      wearableEnabled: true,
      wearableConnectedAt: typeof current.profile.wearableConnectedAt === "string" ? current.profile.wearableConnectedAt : timestamp,
      wearableLastSyncAt: timestamp,
    });
    await db
      .prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, JSON.stringify(nextProfile), Date.now(), version)
      .run();

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
