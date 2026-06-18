// Cloudflare Pages Function: /api/state
// Stores small/medium JSON blobs (diary/history/cards/etc.) in D1 user_kv.
// This enables cross-device sync while keeping the client code largely unchanged.

import { requireUser, json } from "./_lib/auth";
import { requireDB, nowMs } from "./_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };


export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";

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

  const db = requireDB(env);
  const body: any = await request.json().catch(() => null);
  if (!body) return json({ error: "BAD_JSON" }, 400);

  const items: { key: string; value: string; baseVersion?: number }[] = Array.isArray(body.items)
    ? body.items
    : body.key
      ? [{ key: body.key, value: body.value ?? "", baseVersion: Number(body.baseVersion ?? 0) || 0 }]
      : [];

  if (!items.length) return json({ error: "NO_ITEMS" }, 400);

  const t = nowMs();
  const results: { key: string; version?: number }[] = [];
  for (const it of items) {
    if (!it?.key) continue;
    const current = await db
      .prepare("SELECT v, version FROM user_kv WHERE user_id = ? AND k = ? LIMIT 1")
      .bind(user.sub, it.key)
      .first<{ v?: string; version?: number }>();
    const currentVersion = Number(current?.version || 0);
    if (Number(it.baseVersion || 0) > 0 && current && currentVersion !== Number(it.baseVersion || 0)) {
      return json({ error: "KV_CONFLICT", key: it.key, value: current?.v ?? "", version: currentVersion }, 409);
    }
    const nextVersion = currentVersion + 1;
    await db
      .prepare(
        "INSERT INTO user_kv (user_id, k, v, updated_at, version) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, it.key, String(it.value ?? ""), t, nextVersion)
      .run();
    results.push({ key: it.key, version: nextVersion });
  }

  return json({ ok: true, items: results }, 200);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return json({ error: "MISSING_KEY" }, 400);

  const db = requireDB(env);
  await db.prepare("DELETE FROM user_kv WHERE user_id = ? AND k = ?").bind(user.sub, key).run();
  return json({ ok: true }, 200);
};
