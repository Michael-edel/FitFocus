// Cloudflare Pages Function: /api/me
// Returns current session user from ff_session cookie, validated against D1 sessions table.

import { requireUser, json } from "./_lib/auth";
import { hasBetaAccess } from "./_lib/access";
import { stateSessionId } from './_lib/state_session';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';

const handleMeGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const u = await requireUser(request, env);
    const hasAccess = await hasBetaAccess(env, u);
    return json({ user: { sub: u.sub, email: u.email, name: u.name, picture: u.picture, roles: u.roles }, hasAccess,
      stateSync: { protocol: 2, guard: 1, accountId: u.sub, sessionId: await stateSessionId(u) } }, 200);
  } catch {
    return json({ user: null }, 200);
  }
};

/** Correlates session restoration outcomes without logging identity or session details. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleMeGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('me.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
