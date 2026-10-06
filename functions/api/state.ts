// Cloudflare Pages Function: /api/state
// Stores small/medium JSON blobs (diary/history/cards/etc.) in D1 user_kv.
// This enables cross-device sync while keeping the client code largely unchanged.

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";
import { readJsonRequest, RequestBodyTooLargeError } from "./_lib/request_body";
import { isAllowedStateKey, isAllowedStatePrefix } from "./_lib/state_keyspace";
import { normalizeStateWrite, parseStateBaseVersion } from './_lib/state_write';
import { deleteStateItem, writeStateItems } from './_lib/state_store';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
const STATE_JSON_BODY_LIMIT_BYTES = 512 * 1024;
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

  const stateWrite = normalizeStateWrite(body, user.sub);
  if (stateWrite.ok === false) {
    return json(
      stateWrite.key ? { error: stateWrite.error, key: stateWrite.key } : { error: stateWrite.error },
      stateWrite.error === 'FORBIDDEN_KEYSPACE' ? 403 : 400,
    );
  }

  const normalizedItems = stateWrite.items;
  const t = nowMs();

  const written = await writeStateItems(db, user.sub, normalizedItems, t);
  if (written.ok === false) return json({ error: 'KV_CONFLICT', ...written.conflict }, 409);
  return json({ ok: true, items: written.items }, 200);
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
  const baseVersion = parseStateBaseVersion(url.searchParams.get("baseVersion"));
  if (baseVersion === null) {
    return json({ error: "BAD_BASE_VERSION", key }, 400);
  }

  const db = requireDB(env);
  const conflict = await deleteStateItem(db, user.sub, key, baseVersion);
  if (conflict) return json({ error: 'KV_CONFLICT', ...conflict }, 409);

  return json({ ok: true }, 200);
};
