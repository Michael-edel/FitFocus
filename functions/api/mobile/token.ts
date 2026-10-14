// Cloudflare Pages Function: /api/mobile/token
// Exchanges an existing FitFocus web session for a short-lived bearer token
// that a native iOS HealthKit bridge can store in Keychain.

import { json } from '../_lib/auth';
import { requireBetaAccess } from '../_lib/access';
import { requireDB } from '../_lib/db';
import { issueMobileToken } from '../_lib/mobile_token';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { requireStateUser, withSessionGuard } from '../_lib/state_session';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database; REQUIRE_INVITE?: string };
const handleMobileTokenPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireStateUser(request, env); } catch { return json({ error: 'UNAUTH' }, 401); }
  try { await requireBetaAccess(env, user); } catch { return json({ error: 'ACCESS_REQUIRED' }, 403); }
  if (!env.AUTH_JWT_SECRET) return json({ error: 'AUTH_CONFIG' }, 500);
  const payload = await issueMobileToken({ db: requireDB(env), secret: env.AUTH_JWT_SECRET, user });
  return payload ? json(payload, 200) : json({ error: 'UNAUTH' }, 401);
};

/** Correlates mobile-token outcomes without logging the token or account fields. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let response = await handleMobileTokenPost(context);
  if (response.status !== 401) response = withSessionGuard(response, context.request, 'Mobile-Token');
  response.headers.set('Cache-Control', 'no-store');
  const requestId = requestIdFor(context.request);
  logApiEvent('mobile.token.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
