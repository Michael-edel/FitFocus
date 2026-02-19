// Cloudflare Pages Function: /api/export
// Premium B2C: user can export their personal data (profile + meals + ai logs).

import { requireUser, errRu } from "./_lib/auth";

type Env = {
  DB?: any; // D1Database
  AUTH_JWT_SECRET?: string;
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;
    if (!env.DB) {
      return new Response(JSON.stringify({ error: errRu("DB_CONFIG") }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const user = await requireUser(request, env);

    const profileRow = await env.DB
      .prepare("SELECT profile_json, updated_at FROM user_profiles WHERE user_id = ?")
      .bind(user.sub)
      .first();
    const meals = await env.DB
      .prepare("SELECT id, ts, raw_json FROM meals WHERE user_id = ? ORDER BY ts DESC LIMIT 5000")
      .bind(user.sub)
      .all();
    const aiEvents = await env.DB
      .prepare("SELECT id, ts, feature, request_json, response_json FROM ai_events WHERE user_id = ? ORDER BY ts DESC LIMIT 5000")
      .bind(user.sub)
      .all();

    let profile: any = null;
    try {
      profile = profileRow?.profile_json ? JSON.parse(profileRow.profile_json) : null;
    } catch {
      profile = null;
    }

    const data = {
      exportedAt: new Date().toISOString(),
      user: { sub: user.sub, email: user.email, name: user.name },
      profile,
      profileUpdatedAt: profileRow?.updated_at || null,
      meals: (meals?.results || []).map((m: any) => ({
        id: m.id,
        ts: m.ts,
        data: safeJsonParse(m.raw_json),
      })),
      aiEvents: (aiEvents?.results || []).map((e: any) => ({
        id: e.id,
        ts: e.ts,
        feature: e.feature,
        request: safeJsonParse(e.request_json),
        response: safeJsonParse(e.response_json),
      })),
    };

    const filename = `fitfocus-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const code = String(e?.message || "");
    if (code === "UNAUTH") {
      return new Response(JSON.stringify({ error: errRu("UNAUTH") }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    if (code === "AUTH_CONFIG") {
      return new Response(JSON.stringify({ error: errRu("AUTH_CONFIG") }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "SERVER", message: String(e?.message || e) } }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
};

function safeJsonParse(s: any) {
  if (!s || typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
