// Cloudflare Pages Function: /api/state
// Stores small/medium JSON blobs (diary/history/cards/etc.) in D1 user_kv.
// This enables cross-device sync while keeping the client code largely unchanged.

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";
import { readJsonRequest, RequestBodyTooLargeError } from "./_lib/request_body";
import { isAllowedStateKey, isAllowedStatePrefix } from "./_lib/state_keyspace";
import { readStateItems } from './_lib/state_read';
import { normalizeStateWrite, parseStateBaseVersion } from './_lib/state_write';
import { deleteStateItem, writeStateItems } from './_lib/state_store';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
const STATE_JSON_BODY_LIMIT_BYTES = 512 * 1024;

function respond(requestId: string, body: unknown, status: number): Response {
  logApiEvent('state.response', { requestId, status });
  const response = withRequestId(json(body, status), requestId);
  response.headers.set('X-FitFocus-State-Protocol', '2');
  return response;
}
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return respond(requestId, { error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env, user);
  } catch {
    return respond(requestId, { error: "ACCESS_REQUIRED" }, 403);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  if (!isAllowedStatePrefix(user.sub, prefix)) {
    return respond(requestId, { error: "FORBIDDEN_KEYSPACE" }, 403);
  }

  const db = requireDB(env);
  const items = await readStateItems(db, user.sub, prefix, url.searchParams.get('includeDeleted') === '1');
  return respond(requestId, { items }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return respond(requestId, { error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env, user);
  } catch {
    return respond(requestId, { error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);
  let body: unknown = null;
  try {
    body = await readJsonRequest(request, STATE_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
        return respond(requestId, { error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!body) return respond(requestId, { error: "BAD_JSON" }, 400);

  const stateWrite = normalizeStateWrite(body, user.sub);
  if (stateWrite.ok === false) {
    return respond(
      requestId,
      stateWrite.key ? { error: stateWrite.error, key: stateWrite.key } : { error: stateWrite.error },
      stateWrite.error === 'FORBIDDEN_KEYSPACE' ? 403 : 400,
    );
  }

  const normalizedItems = stateWrite.items;
  const t = nowMs();

  const written = await writeStateItems(db, user.sub, normalizedItems, t);
  if (written.ok === false) return respond(requestId, { error: 'KV_CONFLICT', ...written.conflict }, 409);
  return respond(requestId, { ok: true, items: written.items }, 200);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return respond(requestId, { error: "UNAUTH" }, 401);
  }
  try {
    await requireBetaAccess(env, user);
  } catch {
    return respond(requestId, { error: "ACCESS_REQUIRED" }, 403);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return respond(requestId, { error: "MISSING_KEY" }, 400);
  if (!isAllowedStateKey(user.sub, key)) {
    return respond(requestId, { error: "FORBIDDEN_KEYSPACE" }, 403);
  }
  const baseVersion = parseStateBaseVersion(url.searchParams.get("baseVersion"));
  if (baseVersion === null) {
    return respond(requestId, { error: "BAD_BASE_VERSION", key }, 400);
  }

  const db = requireDB(env);
  const deleted = await deleteStateItem(db, user.sub, key, baseVersion);
  if (deleted.ok === false) return respond(requestId, { error: 'KV_CONFLICT', ...deleted.conflict }, 409);

  return respond(requestId, { ok: true, ...deleted.item }, 200);
};
