// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

const EDITABLE_PROFILE_FIELDS = new Set([
  'name',
  'gender',
  'weight',
  'height',
  'age',
  'activityLevel',
  'goal',
  'targetWeight',
  'adaptationMultiplier',
  'lastAdaptationDate',
  'lastCheckInDate',
  'familyMembers',
  'exclusions',
  'familyExclusions',
  'lossDeficit',
  'gainSurplus',
  'riskAcknowledgedLoss',
  'riskAcknowledgedGain',
  'courseProgress',
  'lessonQuizAnswers',
  'usage',
  'dailyHabits',
  'tasks',
  'aiPlan',
  'weightHistory',
  'dietary',
]);

function sanitizePatch(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!EDITABLE_PROFILE_FIELDS.has(key)) continue;
    patch[key] = value;
  }
  return patch;
}

async function loadActivePlan(db: D1Database, userId: string): Promise<"free" | "pro" | "family"> {
  try {
    const row = await db
      .prepare(
        "SELECT plan FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY updated_at DESC LIMIT 1"
      )
      .bind(userId)
      .first<{ plan?: string }>();
    const plan = String(row?.plan || "").toLowerCase();
    if (plan === "pro" || plan === "family") return plan;
  } catch {}
  return "free";
}

async function loadProfile(db: D1Database, userId: string): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare("SELECT profile_json FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first();

  if (!row?.profile_json) return null;
  try {
    const parsed = JSON.parse(String(row.profile_json)) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function withProtectedFields(user: { sub: string; email?: string; name?: string; picture?: string }, profile: Record<string, unknown>) {
  const plan = String(profile.plan || "free");
  const normalizedPlan = plan === "pro" || plan === "family" ? plan : "free";
  return {
    ...profile,
    id: user.sub,
    googleSub: user.sub,
    email: user.email,
    name: typeof profile.name === 'string' && profile.name.trim().length ? profile.name : (user.name ?? 'Пользователь'),
    picture: profile.picture ?? user.picture,
    plan: normalizedPlan,
    planTier: normalizedPlan === "free" ? "free" : "pro",
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env as any, user as any); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  const profile = await loadProfile(db, user.sub);
  if (!profile) return json({ profile: null }, 200);
  const serverPlan = await loadActivePlan(db, user.sub);
  return json({ profile: withProtectedFields(user, { ...profile, plan: serverPlan }) }, 200);
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env as any, user as any); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: "BAD_JSON" }, 400);

  const patch = sanitizePatch(body);
  const serverPlan = await loadActivePlan(db, user.sub);
  const profile = withProtectedFields(user, { ...patch, plan: serverPlan });

  const t = nowMs();
  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at"
    )
    .bind(user.sub, JSON.stringify(profile), t)
    .run();

  return json({ profile, updatedFields: Object.keys(patch), mode: 'replace' }, 200);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try { await requireBetaAccess(env as any, user as any); } catch { return json({ error: "ACCESS_REQUIRED" }, 403); }

  const db = requireDB(env);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: "BAD_JSON" }, 400);

  const patch = sanitizePatch(body);
  const updatedFields = Object.keys(patch);
  if (!updatedFields.length) return json({ error: 'EMPTY_PATCH' }, 400);

  const current = (await loadProfile(db, user.sub)) ?? {};
  const serverPlan = await loadActivePlan(db, user.sub);
  const profile = withProtectedFields(user, { ...current, ...patch, plan: serverPlan });

  const t = nowMs();
  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at"
    )
    .bind(user.sub, JSON.stringify(profile), t)
    .run();

  return json({ profile, updatedFields, mode: 'patch' }, 200);
};
