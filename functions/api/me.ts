// Cloudflare Pages Function: /api/me
// Returns current session user from ff_session cookie, validated against D1 sessions table.

import { requireUser, json } from "./_lib/auth";
import { hasBetaAccess } from "./_lib/access";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const u = await requireUser(request, env);
    const hasAccess = await hasBetaAccess(env, u);
    return json({ user: { sub: u.sub, email: u.email, name: u.name, picture: u.picture, roles: u.roles }, hasAccess }, 200);
  } catch {
    return json({ user: null }, 200);
  }
};

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };
