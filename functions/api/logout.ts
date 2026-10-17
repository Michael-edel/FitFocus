// Cloudflare Pages Function: /api/logout
// Revokes only the current session when its account/session proof is present.

import { readCookie, verifySessionJwt } from "./_lib/auth";
import { revokeSession } from "./_lib/session_revocation";
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';
import { assertStateRequestScope, withSessionGuard } from './_lib/state_session';

const handleLogoutPost: PagesFunction<Env> = async ({ request, env }) => {
  const account = request.headers.get('X-FitFocus-State-Account');
  const session = request.headers.get('X-FitFocus-State-Session');
  const unauth = (error = 'UNAUTH') => withSessionGuard(new Response(JSON.stringify({ ok: false, error }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  }), request, 'Logout');

  // A cookie-only legacy request could arrive after another tab replaces the
  // cookie. Reject it before reading or revoking whichever session is current.
  if (!account || !session) return unauth();

  const token = readCookie(request.headers.get("Cookie") || "", "ff_session");
  if (!token || !env.AUTH_JWT_SECRET) return unauth();

  const payload = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
  const sid = String(payload?.sid || '');
  const sub = String(payload?.sub || '');
  if (!sid || !sub) return unauth();
  try {
    await assertStateRequestScope({ sub, sid }, request);
  } catch {
    return unauth('STATE_SESSION_CHANGED');
  }

  // Revoke only the session represented by the captured proof.
  try {
    if (env.DB) await revokeSession(env.DB, sid, sub);
  } catch {
    // ignore
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  // Do not let a delayed, scoped logout response erase another tab's newer
  // login cookie. The captured session is revoked server-side; its cookie is no
  // longer usable and the next OAuth callback replaces it.
  return withSessionGuard(new Response(JSON.stringify({ ok: true }), { status: 200, headers }), request, 'Logout');
};

/** Correlates logout completion without recording session or user information. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleLogoutPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('auth.logout.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
