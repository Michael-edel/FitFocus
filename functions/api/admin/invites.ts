// /api/admin/invites
// GET: list invite codes; POST: create; PUT: revoke/unrevoke (admin only).
import { json, requireUser } from '../_lib/auth';
import { requireDB, toApiError } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { createAdminInvites, listAdminInvites, updateAdminInvite } from '../_lib/admin_invites';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function errorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413);
  const apiError = toApiError(error);
  return json({ error: apiError }, apiError.code === 'UNAUTH' ? 401 : apiError.code === 'FORBIDDEN' ? 403 : 400);
}

async function requireAdmin(context: Parameters<PagesFunction<Env>>[0]) {
  const user = await requireUser(context.request, context.env);
  requireRole(user, 'admin');
  const db = requireDB(context.env);
  await requireAdminRequest(user, context.request, db);
  return { user, db };
}

const handleAdminInvitesGet: PagesFunction<Env> = async (context) => {
  try {
    const { db } = await requireAdmin(context);
    const data = await listAdminInvites(db, new URL(context.request.url).searchParams.get('limit'));
    return json({ invites: data.invites }, 200);
  } catch (error) {
    return errorResponse(error);
  }
};

const handleAdminInvitesPost: PagesFunction<Env> = async (context) => {
  try {
    const { user, db } = await requireAdmin(context);
    const body = await readJsonRequest(context.request, SMALL_JSON_BODY_LIMIT_BYTES);
    return json(await createAdminInvites(db, user.sub, body), 200);
  } catch (error) {
    return errorResponse(error);
  }
};

const handleAdminInvitesPut: PagesFunction<Env> = async (context) => {
  try {
    const { user, db } = await requireAdmin(context);
    const body = await readJsonRequest(context.request, SMALL_JSON_BODY_LIMIT_BYTES);
    const result = await updateAdminInvite(db, user.sub, body);
    if (result.kind === 'invalid') return json({ error: 'BAD_REQUEST' }, 400);
    if (result.kind === 'not-found') return json({ error: 'NOT_FOUND', message: 'invite code not found' }, 404);
    return json({ ok: true, code: result.code, revoked: result.revoked }, 200);
  } catch (error) {
    return errorResponse(error);
  }
};

async function trace(context: Parameters<PagesFunction<Env>>[0], event: string, handler: PagesFunction<Env>) {
  const response = await handler(context);
  const requestId = requestIdFor(context.request);
  logApiEvent(event, { requestId, status: response.status });
  return withRequestId(response, requestId);
}

/** Traces only operation and result; invitation codes and notes stay out of events. */
export const onRequestGet: PagesFunction<Env> = (context) => trace(context, 'admin.invites.get.response', handleAdminInvitesGet);
export const onRequestPost: PagesFunction<Env> = (context) => trace(context, 'admin.invites.post.response', handleAdminInvitesPost);
export const onRequestPut: PagesFunction<Env> = (context) => trace(context, 'admin.invites.put.response', handleAdminInvitesPut);
