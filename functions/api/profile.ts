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
  'medicalRestrictions',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'bloodPressureMeasuredAt',
  'waistCm',
  'chestCm',
  'hipsCm',
  'bodyMeasurementsMeasuredAt',
  'restingPulse',
  'restingPulseMeasuredAt',
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
  'measurementsHistory',
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

function sanitizeStateItems(input: unknown): { key: string; value: string }[] {
  if (!Array.isArray(input)) return [];
  const items: { key: string; value: string }[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const key = typeof (entry as any).key === 'string' ? (entry as any).key : '';
    const value = typeof (entry as any).value === 'string' ? (entry as any).value : '';
    if (!key) continue;
    items.push({ key, value });
  }
  return items;
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
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row?.profile_json) return null;
  try {
    const parsed = JSON.parse(String(row.profile_json)) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? { ...parsed, version: Number(row.version || 1) } : null;
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
    version: typeof profile.version === 'number' ? profile.version : Number(profile.version || 1),
  };
}

async function loadProfileMeta(db: D1Database, userId: string): Promise<{ profile: Record<string, unknown> | null; version: number }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row?.profile_json) return { profile: null, version: 0 };
  try {
    const parsed = JSON.parse(String(row.profile_json)) as Record<string, unknown>;
    return {
      profile: parsed && typeof parsed === 'object' ? parsed : null,
      version: Number(row.version || 1),
    };
  } catch {
    return { profile: null, version: Number(row?.version || 0) };
  }
}

function conflictResponse(user: { sub: string; email?: string; name?: string; picture?: string }, profile: Record<string, unknown>, version: number) {
  const serverProfile = withProtectedFields(user, { ...profile, version });
  return json({ error: 'PROFILE_CONFLICT', profile: serverProfile, version }, 409);
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
  const stateItems = sanitizeStateItems((body as any).stateItems);
  const baseVersion = Number((body as any).baseVersion ?? 0);
  const currentMeta = await loadProfileMeta(db, user.sub);
  if (currentMeta.profile && baseVersion > 0 && currentMeta.version !== baseVersion) {
    return conflictResponse(user as any, currentMeta.profile, currentMeta.version);
  }
  const serverPlan = await loadActivePlan(db, user.sub);
  const nextVersion = (currentMeta.version || 0) + 1;
  const profile = withProtectedFields(user, { ...patch, plan: serverPlan, version: nextVersion });

  const t = nowMs();
  const statements = [
    db
      .prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, JSON.stringify(profile), t, nextVersion),
    ...stateItems.map((it) =>
      db
        .prepare(
          "INSERT INTO user_kv (user_id, k, v, updated_at, version) VALUES (?, ?, ?, ?, ?) " +
            "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version"
        )
        .bind(user.sub, it.key, it.value, t, nextVersion)
    ),
  ];
  await db.batch(statements);

  return json({ profile, updatedFields: Object.keys(patch), stateItems: stateItems.length, mode: 'replace', version: nextVersion }, 200);
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
  const stateItems = sanitizeStateItems((body as any).stateItems);
  const updatedFields = Object.keys(patch);
  if (!updatedFields.length) return json({ error: 'EMPTY_PATCH' }, 400);

  const currentMeta = await loadProfileMeta(db, user.sub);
  const baseVersion = Number((body as any).baseVersion ?? 0);
  if (currentMeta.profile && baseVersion > 0 && currentMeta.version !== baseVersion) {
    return conflictResponse(user as any, currentMeta.profile, currentMeta.version);
  }
  const serverPlan = await loadActivePlan(db, user.sub);
  const nextVersion = (currentMeta.version || 0) + 1;
  const profile = withProtectedFields(user, { ...(currentMeta.profile ?? {}), ...patch, plan: serverPlan, version: nextVersion });

  const t = nowMs();
  const statements = [
    db
      .prepare(
        "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
      )
      .bind(user.sub, JSON.stringify(profile), t, nextVersion),
    ...stateItems.map((it) =>
      db
        .prepare(
          "INSERT INTO user_kv (user_id, k, v, updated_at, version) VALUES (?, ?, ?, ?, ?) " +
            "ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version"
        )
        .bind(user.sub, it.key, it.value, t, nextVersion)
    ),
  ];
  await db.batch(statements);

  return json({ profile, updatedFields, stateItems: stateItems.length, mode: 'patch', version: nextVersion }, 200);
};
