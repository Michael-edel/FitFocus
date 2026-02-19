// Cloudflare Pages Function: /api/state
// Stores small/medium JSON blobs (diary/history/cards/etc.) in D1 user_kv.
// This enables cross-device sync while keeping the client code largely unchanged.

import { requireUser } from "./_lib/auth";
import { requireDB, nowMs } from "./_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

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
    .prepare("SELECT k, v FROM user_kv WHERE user_id = ? AND k LIKE ?")
    .bind(user.sub, prefix + "%")
    .all<{ k: string; v: string }>();

  const items = (results || []).map((r) => ({ key: r.k, value: r.v }));
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
  const body = await request.json<any>().catch(() => null);
  if (!body) return json({ error: "BAD_JSON" }, 400);

  const items: { key: string; value: string }[] = Array.isArray(body.items)
    ? body.items
    : body.key
      ? [{ key: body.key, value: body.value ?? "" }]
      : [];

  if (!items.length) return json({ error: "NO_ITEMS" }, 400);

  const t = nowMs();
  // naive batch upsert
  for (const it of items) {
    if (!it?.key) continue;
    await db
      .prepare(
        "INSERT INTO user_kv (user_id, k, v, updated_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at"
      )
      .bind(user.sub, it.key, String(it.value ?? ""), t)
      .run();
  }

  return json({ ok: true }, 200);
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
