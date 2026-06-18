// Cloudflare Pages Function: /api/export
// GDPR-style export of user data (profile + kv blobs)

import { requireUser } from "./_lib/auth";
import { requireDB } from "./_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return new Response(JSON.stringify({ error: "UNAUTH" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }

  const db = requireDB(env);

  const profRow = await db
    .prepare("SELECT profile_json, updated_at, version FROM user_profiles WHERE user_id = ?")
    .bind(user.sub)
    .first<{ profile_json: string; updated_at: number; version: number }>();

  const { results } = await db
    .prepare("SELECT k, v, updated_at, version FROM user_kv WHERE user_id = ?")
    .bind(user.sub)
    .all<{ k: string; v: string; updated_at: number; version: number }>();

  const payload = {
    generated_at: new Date().toISOString(),
    user,
    profile: profRow?.profile_json ? safeParse(profRow.profile_json) : null,
    profile_updated_at: profRow?.updated_at ?? null,
    profile_version: profRow?.version ?? null,
    kv: (results || []).map((r) => ({ key: r.k, value: r.v, updated_at: r.updated_at, version: r.version })),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fitfocus-export-${date}.json"`,
    },
  });
};

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
