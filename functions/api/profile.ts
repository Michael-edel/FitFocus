// Cloudflare Pages Function: /api/profile
// Source-of-truth user profile stored in D1 (JSON blob).

import { requireUser, json, errRu } from "./_lib/auth";

type Env = {
  DB?: any; // D1Database
  AUTH_JWT_SECRET?: string;
};

function nowMs() {
  return Date.now();
}

function defaultProfile(user: { sub: string; name?: string }) {
  // Minimal defaults for the existing front-end UserProfile shape.
  // IMPORTANT: keep fields aligned with `types.ts` UserProfile.
  const id = user.sub;
  const name = user.name || "";
  return {
    id,
    name,
    gender: "MALE",
    weight: 80,
    height: 175,
    age: 30,
    activityLevel: 1.375,
    goal: "LOSS",
    weightHistory: [],
    targetWeight: 70,
    adaptationMultiplier: 1,
    familyMembers: [],
    exclusions: "",
    lossDeficit: 400,
    gainSurplus: 250,
    usage: {},
  };
}

async function ensureUserRow(db: any, user: { sub: string; email?: string }) {
  await db
    .prepare("INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(user.sub, user.email || "", Math.floor(Date.now() / 1000))
    .run();
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;
    if (!env.DB) return json({ error: errRu("DB_CONFIG") }, 500);

    const user = await requireUser(request, env);
    await ensureUserRow(env.DB, user);

    const row = await env.DB
      .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
      .bind(user.sub)
      .first();

    if (!row?.profile_json) {
      const profile = defaultProfile(user);
      await env.DB
        .prepare("INSERT OR REPLACE INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)")
        .bind(user.sub, JSON.stringify(profile), nowMs())
        .run();
      return json({ profile }, 200);
    }

    let profile: any = null;
    try {
      profile = JSON.parse(row.profile_json);
    } catch {
      profile = defaultProfile(user);
    }

    // гарантируем id
    profile.id = user.sub;
    if (!profile.name) profile.name = user.name || "";

    return json({ profile }, 200);
  } catch (e: any) {
    const code = String(e?.message || "");
    if (code === "UNAUTH") return json({ error: errRu("UNAUTH") }, 401);
    if (code === "AUTH_CONFIG") return json({ error: errRu("AUTH_CONFIG") }, 500);
    return json({ error: { code: "SERVER", message: String(e?.message || e) } }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;
    if (!env.DB) return json({ error: errRu("DB_CONFIG") }, 500);

    const user = await requireUser(request, env);
    await ensureUserRow(env.DB, user);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: errRu("BAD_REQUEST") }, 400);

    // Accept either {profile:{...}} or directly profile object.
    const incoming = (body as any).profile ?? body;
    if (!incoming || typeof incoming !== "object") return json({ error: errRu("BAD_REQUEST") }, 400);

    // merge with existing
    const existingRow = await env.DB
      .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
      .bind(user.sub)
      .first();

    let base: any = existingRow?.profile_json ? JSON.parse(existingRow.profile_json) : defaultProfile(user);
    const profile = { ...base, ...incoming, id: user.sub };
    if (!profile.name) profile.name = user.name || "";

    await env.DB
      .prepare("INSERT OR REPLACE INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?)")
      .bind(user.sub, JSON.stringify(profile), nowMs())
      .run();

    return json({ ok: true, profile }, 200);
  } catch (e: any) {
    const code = String(e?.message || "");
    if (code === "UNAUTH") return json({ error: errRu("UNAUTH") }, 401);
    if (code === "AUTH_CONFIG") return json({ error: errRu("AUTH_CONFIG") }, 500);
    return json({ error: { code: "SERVER", message: String(e?.message || e) } }, 500);
  }
};
