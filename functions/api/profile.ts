// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { requireUser } from "./_lib/auth";
import { requireDB, nowMs } from "./_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const row = await db
    .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
    .bind(user.sub)
    .first<{ profile_json: string }>();

  if (!row?.profile_json) {
    // No profile yet: return null so UI can show onboarding
    return json({ profile: null }, 200);
  }

  try {
    return json({ profile: JSON.parse(row.profile_json) }, 200);
  } catch {
    return json({ error: "PROFILE_CORRUPT" }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const body = await request.json<any>().catch(() => null);
  if (!body) return json({ error: "BAD_JSON" }, 400);

  // Enforce user ownership
  const profile = { ...body, id: user.sub, googleSub: user.sub, email: user.email, name: body.name ?? user.name, picture: body.picture ?? user.picture };

  const t = nowMs();
  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at"
    )
    .bind(user.sub, JSON.stringify(profile), t)
    .run();

  return json({ profile }, 200);
};
