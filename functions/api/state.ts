// Cloudflare Pages Function: /api/state
// Stores small/medium JSON blobs (diary/history/cards/etc.) in D1 user_kv.
// This enables cross-device sync while keeping the client code largely unchanged.

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";
import { isJsonObject } from "./_lib/json";
import { readJsonRequest, RequestBodyTooLargeError } from "./_lib/request_body";
import { isAllowedStateKey, isAllowedStatePrefix } from "./_lib/state_keyspace";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
const STATE_JSON_BODY_LIMIT_BYTES = 512 * 1024;
type StatePutItem = { key: unknown; value: unknown; baseVersion?: unknown };
type D1WriteResult = { meta?: { changes?: number } | null; changes?: number };

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsedBaseVersion = Number(value);
  if (!Number.isFinite(parsedBaseVersion) || !Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) return null;
  return parsedBaseVersion;
}

function changedRows(result: D1WriteResult | null | undefined): number {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  if (!isAllowedStatePrefix(user.sub, prefix)) {
    return json({ error: "FORBIDDEN_KEYSPACE" }, 403);
  }

  const db = requireDB(env);
  const { results } = await db
    .prepare("SELECT k, v, version, updated_at FROM user_kv WHERE user_id = ? AND k LIKE ?")
    .bind(user.sub, prefix + "%")
    .all();

  const items = (results || [])
    .filter((r) => typeof r.k === "string" && isAllowedStateKey(user.sub, r.k))
    .map((r) => ({ key: r.k, value: r.v, version: r.version, updated_at: r.updated_at }));
  return json({ items }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, STATE_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!body) return json({ error: "BAD_JSON" }, 400);

  const items: StatePutItem[] = isJsonObject(body) && Array.isArray(body.items)
    ? body.items.map((item) => (isJsonObject(item) ? { key: item.key, value: item.value, baseVersion: item.baseVersion } : { key: null, value: null }))
    : isJsonObject(body) && body.key
      ? [{ key: body.key, value: body.value ?? "", baseVersion: body.baseVersion }]
      : [];

  if (!items.length) return json({ error: "NO_ITEMS" }, 400);

  const t = nowMs();
  const normalizedItems: { key: string; value: string; baseVersion: number }[] = [];
  const seenKeys = new Set<string>();
  for (const it of items) {
    const key = String(it?.key || "");
    if (!key) continue;
    if (!isAllowedStateKey(user.sub, key)) {
      return json({ error: "FORBIDDEN_KEYSPACE" }, 403);
    }
    if (seenKeys.has(key)) {
      return json({ error: "DUPLICATE_KEY", key }, 400);
    }
    seenKeys.add(key);
    const baseVersion = parseBaseVersion(it.baseVersion);
    if (baseVersion === null) {
      return json({ error: "BAD_BASE_VERSION", key }, 400);
    }
    normalizedItems.push({
      key,
      value: String(it.value ?? ""),
      baseVersion,
    });
  }

  if (!normalizedItems.length) return json({ error: "NO_ITEMS" }, 400);

  // The preflight check gives the client the current value for ordinary conflicts.
  // The write below repeats the version condition inside one SQL statement, so a
  // concurrent write cannot slip in between this read and the update.
  for (const item of normalizedItems) {
    const current = await db
      .prepare("SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1")
      .bind(user.sub, item.key)
      .first<{ v?: string; version?: number }>();
    const currentVersion = Number(current?.version || 0);
    if (
      (item.baseVersion > 0 && (!current || currentVersion !== item.baseVersion)) ||
      (item.baseVersion === 0 && current)
    ) {
      return json({ error: "KV_CONFLICT", key: item.key, value: current?.v ?? "", version: currentVersion }, 409);
    }
  }

  const values = normalizedItems.map(() => "(?, ?, ?)").join(", ");
  const atomicWriteSql =
    "WITH input(k, v, base_version) AS (VALUES " + values + "), " +
    "conflict AS (" +
      "SELECT 1 FROM input " +
      "LEFT JOIN user_kv current ON current.user_id = ? AND current.k = input.k " +
      "WHERE (input.base_version = 0 AND current.version IS NOT NULL) " +
        "OR (input.base_version > 0 AND (current.version IS NULL OR current.version != input.base_version))" +
    ") " +
    "INSERT INTO user_kv (user_id, k, v, updated_at, version) " +
    "SELECT ?, input.k, input.v, ?, COALESCE(current.version, 0) + 1 " +
    "FROM input " +
    "LEFT JOIN user_kv current ON current.user_id = ? AND current.k = input.k " +
    "WHERE NOT EXISTS (SELECT 1 FROM conflict) " +
    "ON CONFLICT(user_id, k) DO UPDATE SET " +
      "v = excluded.v, updated_at = excluded.updated_at, version = excluded.version " +
    "RETURNING k, version";

  const writeResult = await db
    .prepare(atomicWriteSql)
    .bind(
      ...normalizedItems.flatMap((item) => [item.key, item.value, item.baseVersion]),
      user.sub,
      user.sub,
      t,
      user.sub,
    )
    .all<{ k: string; version: number }>();

  const written = writeResult.results || [];
  if (written.length !== normalizedItems.length) {
    for (const item of normalizedItems) {
      const current = await db
        .prepare("SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1")
        .bind(user.sub, item.key)
        .first<{ v?: string; version?: number }>();
      const currentVersion = Number(current?.version || 0);
      if (
        (item.baseVersion > 0 && (!current || currentVersion !== item.baseVersion)) ||
        (item.baseVersion === 0 && current)
      ) {
        return json({
          error: "KV_CONFLICT",
          key: item.key,
          value: current?.v ?? "",
          version: currentVersion,
        }, 409);
      }
    }
    return json({ error: "KV_CONFLICT" }, 409);
  }

  const versionByKey = new Map(written.map((item) => [item.k, item.version]));
  return json({
    ok: true,
    items: normalizedItems.map((item) => ({ key: item.key, version: versionByKey.get(item.key) })),
  }, 200);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return json({ error: "MISSING_KEY" }, 400);
  if (!isAllowedStateKey(user.sub, key)) {
    return json({ error: "FORBIDDEN_KEYSPACE" }, 403);
  }
  const baseVersion = parseBaseVersion(url.searchParams.get("baseVersion"));
  if (baseVersion === null) {
    return json({ error: "BAD_BASE_VERSION", key }, 400);
  }

  const db = requireDB(env);
  const deleted = await db
    .prepare("DELETE FROM user_kv WHERE user_id = ? AND k = ? AND (? = 0 OR version = ?)")
    .bind(user.sub, key, baseVersion, baseVersion)
    .run();

  const deletedChanges = Number((deleted.meta as { changes?: number } | undefined)?.changes || 0);
  if (baseVersion > 0 && !deletedChanges) {
    const current = await db
      .prepare("SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1")
      .bind(user.sub, key)
      .first<{ v?: string; version?: number }>();
    if (current && Number(current.version || 0) !== baseVersion) {
      return json({
        error: "KV_CONFLICT",
        key,
        value: current.v ?? "",
        version: Number(current.version || 0),
      }, 409);
    }
  }

  return json({ ok: true }, 200);
};
