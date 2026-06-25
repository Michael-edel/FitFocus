// Cloudflare Pages Function: /api/state
// Stores small/medium JSON blobs (diary/history/cards/etc.) in D1 user_kv.
// This enables cross-device sync while keeping the client code largely unchanged.

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";
import { isAllowedStateKey, isAllowedStatePrefix } from "./_lib/state_keyspace";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function parseBaseVersion(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsedBaseVersion = Number(value);
  if (!Number.isFinite(parsedBaseVersion) || !Number.isInteger(parsedBaseVersion) || parsedBaseVersion < 0) return null;
  return parsedBaseVersion;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env as any, user as any);
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

  const items = (results || []).map((r) => ({ key: r.k, value: r.v, version: r.version, updated_at: r.updated_at }));
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
    await requireBetaAccess(env as any, user as any);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);
  const body: any = await request.json().catch(() => null);
  if (!body) return json({ error: "BAD_JSON" }, 400);

  const items: { key: unknown; value: unknown; baseVersion?: unknown }[] = Array.isArray(body.items)
    ? body.items
    : body.key
      ? [{ key: body.key, value: body.value ?? "", baseVersion: body.baseVersion }]
      : [];

  if (!items.length) return json({ error: "NO_ITEMS" }, 400);

  const t = nowMs();
  const normalizedItems: { key: string; value: string; baseVersion: number }[] = [];
  const currentByKey = new Map<string, { value: string; version: number }>();
  for (const it of items) {
    const key = String(it?.key || "");
    if (!key) continue;
    if (!isAllowedStateKey(user.sub, key)) {
      return json({ error: "FORBIDDEN_KEYSPACE", key }, 403);
    }
    const baseVersion = parseBaseVersion(it.baseVersion);
    if (baseVersion === null) {
      return json({ error: "BAD_BASE_VERSION", key }, 400);
    }
    const normalized = {
      key,
      value: String(it.value ?? ""),
      baseVersion,
    };
    normalizedItems.push(normalized);
    const current = await db
      .prepare("SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1")
      .bind(user.sub, normalized.key)
      .first<{ v?: string; version?: number }>();
    const currentVersion = Number(current?.version || 0);
    if (normalized.baseVersion > 0 && current && currentVersion !== normalized.baseVersion) {
      return json({ error: "KV_CONFLICT", key: normalized.key, value: current?.v ?? "", version: currentVersion }, 409);
    }
    currentByKey.set(normalized.key, {
      value: String(current?.v ?? ""),
      version: currentVersion,
    });
  }

  const statements = normalizedItems.map((it) => {
    const current = currentByKey.get(it.key) || { value: "", version: 0 };
    const nextVersion = current.version + 1;
    return db
      .prepare(
        "INSERT INTO user_kv (user_id, k, v, updated_at, version) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, it.key, it.value, t, nextVersion);
  });
  await db.batch(statements);

  const results = normalizedItems.map((it) => ({
    key: it.key,
    version: (currentByKey.get(it.key)?.version || 0) + 1,
  }));

  return json({ ok: true, items: results }, 200);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env as any, user as any);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return json({ error: "MISSING_KEY" }, 400);
  if (!isAllowedStateKey(user.sub, key)) {
    return json({ error: "FORBIDDEN_KEYSPACE", key }, 403);
  }

  const db = requireDB(env);
  await db.prepare("DELETE FROM user_kv WHERE user_id = ? AND k = ?").bind(user.sub, key).run();
  return json({ ok: true }, 200);
};
