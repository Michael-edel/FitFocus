import { getBaseUrl, normalizeAppUrl } from "../auth/_oauth";
import { isJsonObject, safeJsonParseObject, type JsonObject } from "./json";
import { decryptSecretValue, encryptSecretValue } from "./secret_box";
import { normalizeProfileRecord } from './profile_contract';
import { withProtectedFields } from './legacy_sync';
import type { SessionUser } from './auth';

export type HuaweiHealthEnv = {
  AUTH_JWT_SECRET: string;
  APP_URL?: string;
  HUAWEI_HEALTH_CLIENT_ID?: string;
  HUAWEI_HEALTH_CLIENT_SECRET?: string;
  HUAWEI_HEALTH_SCOPES?: string;
  HUAWEI_HEALTH_AUTH_URL?: string;
  HUAWEI_HEALTH_TOKEN_URL?: string;
  HUAWEI_HEALTH_API_BASE_URL?: string;
  HUAWEI_HEALTH_REDIRECT_URI?: string;
  HUAWEI_HEALTH_TOKEN_SECRET?: string;
  HUAWEI_HEALTH_STEPS_DATA_TYPE?: string;
  HUAWEI_HEALTH_ACTIVE_MINUTES_DATA_TYPE?: string;
  HUAWEI_HEALTH_SLEEP_DATA_TYPE?: string;
  HUAWEI_HEALTH_PULSE_DATA_TYPE?: string;
};

export type HuaweiConnectionRow = {
  user_id: string;
  provider: string;
  access_token_enc: string;
  refresh_token_enc?: string | null;
  token_type?: string | null;
  scope?: string | null;
  expires_at?: number | null;
  created_at: number;
  updated_at: number;
  last_sync_at?: number | null;
  status: string;
  metadata_json?: string | null;
};

export type HuaweiTokenSet = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
  expiresAt: number | null;
};

export type HuaweiDailySnapshot = {
  stepsToday?: number;
  activeMinutesToday?: number;
  sleepHoursLastNight?: number;
  pulse?: number;
  raw: unknown;
};

const HUAWEI_PROVIDER = "huawei_health";
const DEFAULT_AUTH_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize";
const DEFAULT_TOKEN_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/token";
const DEFAULT_API_BASE_URL = "https://health-api.cloud.huawei.com/healthkit/v1";
const DEFAULT_STEPS_DATA_TYPE = "com.huawei.continuous.steps.delta";

export async function loadHuaweiProfile(db: D1Database, userId: string): Promise<{ profile: JsonObject; version: number }> {
  const row = await db.prepare('SELECT profile_json, version FROM user_profiles WHERE user_id = ?').bind(userId).first<{ profile_json?: string; version?: number }>();
  return { profile: row?.profile_json ? normalizeProfileRecord(safeJsonParseObject(String(row.profile_json))) : {}, version: Number(row?.version || 0) };
}

export function buildHuaweiSyncedProfile(input: {
  user: SessionUser;
  currentProfile: JsonObject;
  plan: string;
  version: number;
  timestamp: string;
  date?: string;
  snapshot: HuaweiDailySnapshot;
}) {
  const { currentProfile, snapshot } = input;
  return withProtectedFields(input.user, normalizeProfileRecord({
    ...currentProfile,
    plan: input.plan,
    version: input.version,
    wearableProvider: huaweiProviderId(),
    wearableEnabled: true,
    wearableConnectedAt: typeof currentProfile.wearableConnectedAt === 'string' ? currentProfile.wearableConnectedAt : input.timestamp,
    wearableLastSyncAt: input.timestamp,
    wearableMetricsUpdatedAt: input.timestamp,
    ...(input.date ? { wearableMetricsDayKey: input.date } : {}),
    ...(typeof snapshot.stepsToday === 'number' ? { wearableStepsToday: snapshot.stepsToday } : {}),
    ...(typeof snapshot.activeMinutesToday === 'number' ? { wearableActiveMinutesToday: snapshot.activeMinutesToday } : {}),
    ...(typeof snapshot.sleepHoursLastNight === 'number' ? { wearableSleepHoursLastNight: snapshot.sleepHoursLastNight } : {}),
    ...(typeof snapshot.pulse === 'number' && snapshot.pulse > 0 ? { restingPulse: snapshot.pulse, restingPulseMeasuredAt: input.timestamp } : {}),
  }));
}

export function protectHuaweiProfile(user: SessionUser, profile: JsonObject) {
  return withProtectedFields(user, profile);
}

export async function markHuaweiSynced(db: D1Database, userId: string, now: number) {
  const seconds = Math.floor(now / 1000);
  await db.prepare('UPDATE wearable_connections SET last_sync_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?')
    .bind(seconds, seconds, userId, huaweiProviderId()).run();
}

export type HuaweiAccessTokenResult =
  | { kind: 'ready'; provider: string; accessToken: string }
  | { kind: 'not-connected' }
  | { kind: 'refresh-token-missing' };

/** Loads a connected Huawei credential and persists an OAuth refresh when needed. */
export async function loadHuaweiAccessToken(
  env: HuaweiHealthEnv,
  request: Request,
  db: D1Database,
  userId: string,
): Promise<HuaweiAccessTokenResult> {
  const provider = huaweiProviderId();
  const row = await db.prepare(
    "SELECT user_id, provider, access_token_enc, refresh_token_enc, token_type, scope, expires_at, created_at, updated_at, last_sync_at, status, metadata_json FROM wearable_connections WHERE user_id = ? AND provider = ? AND status = 'connected' LIMIT 1",
  ).bind(userId, provider).first<HuaweiConnectionRow>();
  if (!row) return { kind: 'not-connected' };

  let accessToken = await decryptHuaweiAccessToken(env, request, row);
  if (shouldRefreshHuaweiToken(row)) {
    const refreshToken = await decryptHuaweiRefreshToken(env, request, row);
    if (!refreshToken) return { kind: 'refresh-token-missing' };
    const tokenSet = await refreshHuaweiAccessToken(env, request, refreshToken);
    const encrypted = await encryptHuaweiTokenSet(env, request, tokenSet);
    accessToken = tokenSet.accessToken;
    await db.prepare(
      "UPDATE wearable_connections SET access_token_enc = ?, refresh_token_enc = COALESCE(?, refresh_token_enc), token_type = ?, scope = ?, expires_at = ?, updated_at = ? WHERE user_id = ? AND provider = ?",
    ).bind(encrypted.accessTokenEnc, encrypted.refreshTokenEnc, tokenSet.tokenType, tokenSet.scope, tokenSet.expiresAt, Math.floor(Date.now() / 1000), userId, provider).run();
  }
  return { kind: 'ready', provider, accessToken };
}

export function huaweiProviderId() {
  return HUAWEI_PROVIDER;
}

export function parseHuaweiBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return 0;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseHuaweiSyncInput(body: unknown) {
  const object = isJsonObject(body) ? body : null;
  const timezone = typeof object?.timezone === 'string' && object.timezone.trim() ? object.timezone.trim() : undefined;
  const date = typeof object?.date === 'string' && object.date.trim() ? object.date.trim() : undefined;
  const hasExplicitBaseVersion = Boolean(object && Object.prototype.hasOwnProperty.call(object, 'baseVersion'));
  return { timezone, date, hasExplicitBaseVersion, baseVersion: parseHuaweiBaseVersion(object?.baseVersion) };
}

export function huaweiChangedFields(snapshot: Pick<HuaweiDailySnapshot, 'stepsToday' | 'activeMinutesToday' | 'sleepHoursLastNight' | 'pulse'>) {
  return Object.keys({
    ...(typeof snapshot.stepsToday === 'number' ? { wearableStepsToday: true } : {}),
    ...(typeof snapshot.activeMinutesToday === 'number' ? { wearableActiveMinutesToday: true } : {}),
    ...(typeof snapshot.sleepHoursLastNight === 'number' ? { wearableSleepHoursLastNight: true } : {}),
    ...(typeof snapshot.pulse === 'number' ? { restingPulse: true } : {}),
  });
}

export async function readHuaweiConnectionStatus(input: {
  db: D1Database;
  userId: string;
  configured: boolean;
}) {
  const row = await input.db
    .prepare('SELECT user_id, provider, token_type, scope, expires_at, created_at, updated_at, last_sync_at, status, metadata_json FROM wearable_connections WHERE user_id = ? AND provider = ? LIMIT 1')
    .bind(input.userId, huaweiProviderId())
    .first<HuaweiConnectionRow>();
  return {
    provider: huaweiProviderId(),
    configured: input.configured,
    connected: row?.status === 'connected',
    status: row?.status || 'disconnected',
    scope: row?.scope || '',
    expiresAt: row?.expires_at || null,
    lastSyncAt: row?.last_sync_at || null,
    metadata: row ? readHuaweiMetadata(row) : {},
  };
}

export async function ensureHuaweiConnectionsSchema(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS wearable_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT,
      token_type TEXT,
      scope TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_sync_at INTEGER,
      status TEXT NOT NULL DEFAULT 'connected',
      metadata_json TEXT,
      UNIQUE(user_id, provider)
    )`,
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_provider ON wearable_connections(user_id, provider)",
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_wearable_connections_status ON wearable_connections(status, updated_at)",
  ).run();
}

export function getHuaweiConfig(env: HuaweiHealthEnv, request?: Request) {
  const baseUrl = request ? (normalizeAppUrl(env.APP_URL) || getBaseUrl(request)) : normalizeAppUrl(env.APP_URL);
  const redirectUri = String(env.HUAWEI_HEALTH_REDIRECT_URI || (baseUrl ? `${baseUrl}/api/wearable/huawei/callback` : "")).trim();
  const scope = String(env.HUAWEI_HEALTH_SCOPES || "").trim();
  const clientId = String(env.HUAWEI_HEALTH_CLIENT_ID || "").trim();
  const clientSecret = String(env.HUAWEI_HEALTH_CLIENT_SECRET || "").trim();
  const authUrl = String(env.HUAWEI_HEALTH_AUTH_URL || DEFAULT_AUTH_URL).trim();
  const tokenUrl = String(env.HUAWEI_HEALTH_TOKEN_URL || DEFAULT_TOKEN_URL).trim();
  const apiBaseUrl = String(env.HUAWEI_HEALTH_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const secret = String(env.HUAWEI_HEALTH_TOKEN_SECRET || env.AUTH_JWT_SECRET || "").trim();
  const missing = [
    !clientId ? "HUAWEI_HEALTH_CLIENT_ID" : "",
    !clientSecret ? "HUAWEI_HEALTH_CLIENT_SECRET" : "",
    !scope ? "HUAWEI_HEALTH_SCOPES" : "",
    !redirectUri ? "HUAWEI_HEALTH_REDIRECT_URI" : "",
    !secret ? "HUAWEI_HEALTH_TOKEN_SECRET" : "",
  ].filter(Boolean);
  return { clientId, clientSecret, scope, redirectUri, authUrl, tokenUrl, apiBaseUrl, secret, missing };
}

export function buildHuaweiAuthorizeUrl(env: HuaweiHealthEnv, request: Request, state: string): URL {
  const config = getHuaweiConfig(env, request);
  if (config.missing.length) throw new Error(`HUAWEI_CONFIG_MISSING:${config.missing.join(",")}`);
  const url = new URL(config.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readTokenSet(payload: unknown, fallbackScope: string): HuaweiTokenSet | null {
  if (!isJsonObject(payload)) return null;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) return null;
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : undefined;
  const tokenType = typeof payload.token_type === "string" && payload.token_type ? payload.token_type : "Bearer";
  const scope = typeof payload.scope === "string" && payload.scope ? payload.scope : fallbackScope;
  const expiresIn = Number(payload.expires_in || 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.floor(Date.now() / 1000) + Math.floor(expiresIn) : null;
  return { accessToken, refreshToken, tokenType, scope, expiresAt };
}

export async function exchangeHuaweiCode(env: HuaweiHealthEnv, request: Request, code: string): Promise<HuaweiTokenSet> {
  const config = getHuaweiConfig(env, request);
  if (config.missing.length) throw new Error(`HUAWEI_CONFIG_MISSING:${config.missing.join(",")}`);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`HUAWEI_TOKEN_EXCHANGE_FAILED:${response.status}`);
  const tokenSet = readTokenSet(payload, config.scope);
  if (!tokenSet) throw new Error("HUAWEI_TOKEN_RESPONSE_INVALID");
  return tokenSet;
}

export async function refreshHuaweiAccessToken(env: HuaweiHealthEnv, request: Request, refreshToken: string): Promise<HuaweiTokenSet> {
  const config = getHuaweiConfig(env, request);
  if (config.missing.length) throw new Error(`HUAWEI_CONFIG_MISSING:${config.missing.join(",")}`);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`HUAWEI_TOKEN_REFRESH_FAILED:${response.status}`);
  const tokenSet = readTokenSet(payload, config.scope);
  if (!tokenSet) throw new Error("HUAWEI_TOKEN_RESPONSE_INVALID");
  return { ...tokenSet, refreshToken: tokenSet.refreshToken || refreshToken };
}

export async function encryptHuaweiTokenSet(env: HuaweiHealthEnv, request: Request, tokenSet: HuaweiTokenSet) {
  const config = getHuaweiConfig(env, request);
  if (!config.secret) throw new Error("HUAWEI_TOKEN_SECRET_MISSING");
  return {
    accessTokenEnc: await encryptSecretValue(tokenSet.accessToken, config.secret),
    refreshTokenEnc: tokenSet.refreshToken ? await encryptSecretValue(tokenSet.refreshToken, config.secret) : null,
  };
}

export async function decryptHuaweiAccessToken(env: HuaweiHealthEnv, request: Request, row: HuaweiConnectionRow): Promise<string> {
  const config = getHuaweiConfig(env, request);
  return decryptSecretValue(row.access_token_enc, config.secret);
}

export async function decryptHuaweiRefreshToken(env: HuaweiHealthEnv, request: Request, row: HuaweiConnectionRow): Promise<string | null> {
  if (!row.refresh_token_enc) return null;
  const config = getHuaweiConfig(env, request);
  return decryptSecretValue(row.refresh_token_enc, config.secret);
}

export function shouldRefreshHuaweiToken(row: HuaweiConnectionRow, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const expiresAt = Number(row.expires_at || 0);
  return Boolean(row.refresh_token_enc) && (!expiresAt || expiresAt - nowSeconds <= 120);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

function zonedDayBoundaryMs(dayKey: string, timeZone: string, end = false): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error("BAD_DAY_KEY");
  const [, yy, mm, dd] = match;
  const y = Number(yy);
  const m = Number(mm) - 1;
  const d = Number(dd);
  const localUtcGuess = Date.UTC(y, m, d + (end ? 1 : 0), 0, 0, 0, 0);
  let utc = localUtcGuess - getTimeZoneOffsetMs(new Date(localUtcGuess), timeZone);
  utc = localUtcGuess - getTimeZoneOffsetMs(new Date(utc), timeZone);
  return utc;
}

function dayKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeTimeZone(value?: string): string {
  const candidate = value && /^[A-Za-z0-9_+\-/]+$/.test(value) ? value : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

export function resolveHuaweiSyncWindow(opts: { date?: string; timezone?: string }) {
  const timeZone = normalizeTimeZone(opts.timezone);
  const date = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : dayKeyInTimeZone(new Date(), timeZone);
  return {
    date,
    timeZone,
    startTime: zonedDayBoundaryMs(date, timeZone, false),
    endTime: zonedDayBoundaryMs(date, timeZone, true),
  };
}

function readFirstNumber(value: JsonObject): number | null {
  for (const key of ["integerValue", "intValue", "longValue", "floatValue", "doubleValue", "value", "sum"]) {
    const next = Number(value[key]);
    if (Number.isFinite(next)) return next;
  }
  return null;
}

function includesMetricName(value: unknown, dataTypeName: string, aliases: string[]): boolean {
  const hay = String(value || "").toLowerCase();
  if (dataTypeName && hay.includes(dataTypeName.toLowerCase())) return true;
  return aliases.some((alias) => hay.includes(alias));
}

function sumMetricValues(payload: unknown, dataTypeName: string, aliases: string[]): number | null {
  let sum = 0;
  let found = false;
  const visit = (value: unknown, matched: boolean) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, matched));
      return;
    }
    if (!isJsonObject(value)) return;
    const selfMatched = matched
      || includesMetricName(value.dataTypeName, dataTypeName, aliases)
      || includesMetricName(value.name, dataTypeName, aliases)
      || includesMetricName(value.fieldName, dataTypeName, aliases);
    if (selfMatched) {
      const n = readFirstNumber(value);
      if (n !== null && Math.abs(n) < 10_000_000) {
        sum += n;
        found = true;
      }
    }
    for (const child of Object.values(value)) visit(child, selfMatched);
  };
  visit(payload, false);
  return found ? sum : null;
}

export async function fetchHuaweiDailySnapshot(
  env: HuaweiHealthEnv,
  request: Request,
  accessToken: string,
  opts: { date?: string; timezone?: string } = {},
): Promise<HuaweiDailySnapshot> {
  const config = getHuaweiConfig(env, request);
  const window = resolveHuaweiSyncWindow(opts);
  const dataTypes = [
    String(env.HUAWEI_HEALTH_STEPS_DATA_TYPE || DEFAULT_STEPS_DATA_TYPE).trim(),
    String(env.HUAWEI_HEALTH_ACTIVE_MINUTES_DATA_TYPE || "").trim(),
    String(env.HUAWEI_HEALTH_SLEEP_DATA_TYPE || "").trim(),
    String(env.HUAWEI_HEALTH_PULSE_DATA_TYPE || "").trim(),
  ].filter(Boolean);
  const response = await fetch(`${config.apiBaseUrl}/sampleSet:polymerize`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      startTime: window.startTime,
      endTime: window.endTime,
      polymerizeWith: dataTypes.map((dataTypeName) => ({ dataTypeName, polymerizeType: "sum" })),
    }),
  });
  const raw = await readJson(response);
  if (!response.ok) throw new Error(`HUAWEI_HEALTH_FETCH_FAILED:${response.status}`);

  const steps = sumMetricValues(raw, String(env.HUAWEI_HEALTH_STEPS_DATA_TYPE || DEFAULT_STEPS_DATA_TYPE), ["step"]);
  const activeMinutes = env.HUAWEI_HEALTH_ACTIVE_MINUTES_DATA_TYPE
    ? sumMetricValues(raw, env.HUAWEI_HEALTH_ACTIVE_MINUTES_DATA_TYPE, ["active", "intensity", "minute"])
    : null;
  const sleepHours = env.HUAWEI_HEALTH_SLEEP_DATA_TYPE
    ? sumMetricValues(raw, env.HUAWEI_HEALTH_SLEEP_DATA_TYPE, ["sleep"])
    : null;
  const pulse = env.HUAWEI_HEALTH_PULSE_DATA_TYPE
    ? sumMetricValues(raw, env.HUAWEI_HEALTH_PULSE_DATA_TYPE, ["heart", "pulse"])
    : null;

  return {
    ...(steps !== null ? { stepsToday: Math.max(0, Math.round(steps)) } : {}),
    ...(activeMinutes !== null ? { activeMinutesToday: Math.max(0, Math.round(activeMinutes)) } : {}),
    ...(sleepHours !== null ? { sleepHoursLastNight: Number((sleepHours > 24 ? sleepHours / 60 : sleepHours).toFixed(1)) } : {}),
    ...(pulse !== null ? { pulse: Math.max(0, Math.round(pulse)) } : {}),
    raw,
  };
}

export function readHuaweiMetadata(row: HuaweiConnectionRow): JsonObject {
  if (!row.metadata_json) return {};
  return safeJsonParseObject(row.metadata_json) || {};
}
