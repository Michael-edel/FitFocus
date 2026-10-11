// Cloudflare Pages Function: /api/bootstrap
// Single request to hydrate app state after login (server-driven).
// Returns public user, profile, items and schema/feature metadata.

import { json } from "./_lib/auth";
import { requireStateUser } from './_lib/state_session';
import { requireBetaAccess } from "./_lib/access";
import { loadFeatures } from "./_lib/features";
import { requireDB } from "./_lib/db";
import { loadCurrentProfile } from './_lib/profile_read';
import { readStateItems } from './_lib/state_read';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';
import { APP_VERSION_LABEL, API_SCHEMA_VERSION, DATA_SCHEMA_VERSION, DB_MIGRATION_VERSION } from "../../versioning";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database; REQUIRE_INVITE?: string };

function respond(request: Request, requestId: string, body: unknown, status: number): Response {
  logApiEvent('bootstrap.response', { requestId, status });
  const response = withRequestId(json(body, status), requestId);
  response.headers.set('X-FitFocus-Bootstrap-Protocol', '1');
  response.headers.set('X-FitFocus-Bootstrap-Guard', '1');
  for (const header of ['X-FitFocus-State-Account', 'X-FitFocus-State-Session']) {
    const value = request.headers.get(header);
    if (value !== null) response.headers.set(header, value);
  }
  return response;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestId = requestIdFor(request);
  let user;
  try {
    user = await requireStateUser(request, env);
  } catch {
    return respond(request, requestId, { error: "UNAUTH" }, 401);
  }

  try {
    await requireBetaAccess(env, user);
  } catch {
    return respond(request, requestId, { error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);

  const profile = await loadCurrentProfile(db, user);

  // Load KV only for this user's fitfocus_data prefix
  const prefix = `fitfocus_data_${user.sub}_`;
  const items = await readStateItems(db, user.sub, prefix);

  const features = await loadFeatures(env, String(user.sub));

  return respond(request, requestId, {
    schema_version: API_SCHEMA_VERSION,
    app_version: APP_VERSION_LABEL,
    data_schema_version: DATA_SCHEMA_VERSION,
    db_migration_version: DB_MIGRATION_VERSION,
    user: { sub: user.sub, email: user.email, name: user.name, picture: user.picture, roles: user.roles },
    profile,
    roles: user.roles,
    features,
    items,
  }, 200);
};
