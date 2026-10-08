// Cloudflare Pages Function: /api/mobile/token
// Exchanges an existing FitFocus web session for a short-lived bearer token
// that a native iOS HealthKit bridge can store in Keychain.

import { requireUser, json } from "../_lib/auth";
import { requireBetaAccess } from "../_lib/access";
import { requireDB, nowMs } from "../_lib/db";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { signSessionJwt } from '../auth/_oauth';

type Env = { AUTH_JWT_SECRET: string; DB: D1Database; REQUIRE_INVITE?: string };
const handleMobileTokenPost: PagesFunction<Env> = async ({ request, env }) => {
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

  if (!env.AUTH_JWT_SECRET) return json({ error: "AUTH_CONFIG" }, 500);
  const db = requireDB(env);
  const now = nowMs();
  const ttl = 60 * 60 * 24 * 30;

  const session = await db
    .prepare("SELECT id, expires_at, revoked FROM sessions WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(user.sid, user.sub)
    .first<{ id?: string; expires_at?: number; revoked?: number }>();

  if (!session || Number(session.revoked || 0) === 1 || Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000)) {
    return json({ error: "UNAUTH" }, 401);
  }

  const token = await signSessionJwt(
    { v: 2, sub: user.sub, sid: user.sid, email: user.email, email_verified: user.emailVerified, name: user.name, picture: user.picture, aud: "mobile", iat: Math.floor(now / 1000) },
    env.AUTH_JWT_SECRET,
    ttl
  );

  return json(
    {
      token,
      tokenType: "Bearer",
      expiresAt: now + ttl * 1000,
      user: {
        id: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    },
    200
  );
};

/** Correlates mobile-token outcomes without logging the token or account fields. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleMobileTokenPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('mobile.token.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
