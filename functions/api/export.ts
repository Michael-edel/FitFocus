// Cloudflare Pages Function: /api/export
// GDPR-style export of user data stored in D1.

import { json, requireUser } from './_lib/auth';
import { requireBetaAccess } from './_lib/access';
import { requireDB } from './_lib/db';
import { buildUserDataExport } from './_lib/user_data_export';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database; REQUIRE_INVITE?: string };

const handleExportGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: 'UNAUTH' }, 401);
  }

  try {
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: 'ACCESS_REQUIRED' }, 403);
  }

  const payload = await buildUserDataExport(requireDB(env), user);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="fitfocus-export-${date}.json"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
};

/** Correlates data export outcomes without logging the export payload or user identity. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleExportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('export.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
