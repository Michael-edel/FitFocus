// Cloudflare Pages Function: /api/me
// Returns current session user from ff_session cookie, validated against D1 sessions table.

import { requireUser, json } from "./_lib/auth";
import { hasBetaAccess } from "./_lib/access";
import { stateSessionId } from './_lib/state_session';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';
import { personalMenuProjectionReady } from './_lib/personal_menu_projection';
import { familyMenuStateReady } from './_lib/family_menu_state';

const handleMeGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const u = await requireUser(request, env);
    const hasAccess = await hasBetaAccess(env, u);
    const [menuProjection, familyMenuState] = await Promise.all([
      personalMenuProjectionReady(env.DB), env.DB ? familyMenuStateReady(env.DB).catch(() => false) : Promise.resolve(false),
    ]);
    return json({ user: { sub: u.sub, email: u.email, name: u.name, picture: u.picture, roles: u.roles }, hasAccess,
      stateSync: { protocol: 2, guard: 1, accountId: u.sub, sessionId: await stateSessionId(u) },
      profileSync: { protocol: 1, guard: 1, ...(menuProjection ? { weeklyMenuProjection: 1 } : {}) },
      inviteSync: { protocol: 1, guard: 1 }, bootstrapSync: { protocol: 1, guard: 1 },
      aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 },
      familySync: { protocol: 1, guard: 1, target: 1 }, ...(familyMenuState ? { familyMenuSync: { protocol: 1, guard: 1, cas: 1 } } : {}),
      achievementSync: { protocol: 1, guard: 1 }, huaweiSync: { protocol: 1, guard: 1 } }, 200);
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
