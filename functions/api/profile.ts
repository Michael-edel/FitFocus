// Cloudflare Pages Function: /api/profile
// Server-driven source-of-truth for UserProfile (stored as JSON in D1)

import { requireUser, json } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { requireDB, nowMs } from "./_lib/db";
import {
  loadActivePlanByEmail as loadActivePlanByEmailShared,
  migrateLegacyAccountByEmail as migrateLegacyAccountByEmailShared,
} from "./_lib/legacy_sync";

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
  'bloodGlucoseMmolL',
  'bloodGlucoseMeasuredAt',
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
  'progressPhotos',
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

async function loadLegacyProfileByEmail(
  db: D1Database,
  email: string,
): Promise<{ userId: string; profile: Record<string, unknown>; version: number } | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  try {
    const row = await db
      .prepare(
        `SELECT up.user_id, up.profile_json, up.version
         FROM user_profiles up
         JOIN users u ON u.id = up.user_id
         WHERE lower(u.email) = ?
         ORDER BY up.updated_at DESC
         LIMIT 1`
      )
      .bind(normalized)
      .first<{ user_id?: string; profile_json?: string; version?: number }>();
    if (!row?.profile_json || !row.user_id) return null;
    const parsed = JSON.parse(String(row.profile_json)) as Record<string, unknown>;
    return parsed && typeof parsed === 'object'
      ? { userId: row.user_id, profile: parsed, version: Number(row.version || 1) }
      : null;
  } catch {
    return null;
  }
}

async function migrateLegacyStateToCurrentUser(db: D1Database, fromUserId: string, toUserId: string) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;
  const oldPrefix = `fitfocus_data_${fromUserId}_`;
  const newPrefix = `fitfocus_data_${toUserId}_`;
  const now = nowMs();

  try {
    const legacyItems = await db
      .prepare(
        `SELECT k, v, version, updated_at
         FROM user_kv
         WHERE user_id = ? AND k LIKE ?`
      )
      .bind(fromUserId, `${oldPrefix}%`)
      .all<{ k: string; v: string; version?: number; updated_at?: number }>();

    const statements: D1PreparedStatement[] = [];
    for (const item of legacyItems.results || []) {
      if (!item?.k) continue;
      const nextKey = item.k.startsWith(oldPrefix) ? `${newPrefix}${item.k.slice(oldPrefix.length)}` : item.k;
      statements.push(
        db.prepare(
          `INSERT INTO user_kv (user_id, k, v, updated_at, version)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version`
        ).bind(toUserId, nextKey, item.v, item.updated_at ?? now, item.version ?? 1)
      );
    }
    if (statements.length) {
      await db.batch(statements);
    }
  } catch {
    // best-effort only
  }

  const replaceTables: Array<{ sql: string; binds: (string | number)[] }> = [
    { sql: "UPDATE user_profiles SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE subscriptions SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE user_roles SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE invite_redemptions SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE usage_daily SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE ai_events SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE recipes SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE weekly_menu_items SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE shopping_checked SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE weekly_menu_portions SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE family_members SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE families SET owner_user_id = ? WHERE owner_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE family_invites SET created_by_user_id = ? WHERE created_by_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE family_invites SET used_by_user_id = ? WHERE used_by_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE admin_events SET admin_user_id = ? WHERE admin_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE admin_events SET target_user_id = ? WHERE target_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE admin_sessions SET admin_user_id = ? WHERE admin_user_id = ?", binds: [toUserId, fromUserId] },
  ];

  for (const stmt of replaceTables) {
    try {
      await db.prepare(stmt.sql).bind(...stmt.binds).run();
    } catch {
      // Ignore missing tables in older schemas.
    }
  }
}

async function migrateLegacyAccountByEmail(
  db: D1Database,
  user: { sub: string; email?: string; name?: string; picture?: string },
): Promise<Record<string, unknown> | null> {
  const legacy = await loadLegacyProfileByEmail(db, user.email || '');
  if (!legacy || legacy.userId === user.sub) return null;

  await migrateLegacyStateToCurrentUser(db, legacy.userId, user.sub);
  const serverPlan = await loadActivePlanByEmailShared(db, user.email || '');
  const migratedProfile = withProtectedFields(user, {
    ...legacy.profile,
    plan: serverPlan,
    version: legacy.version,
  });

  const t = nowMs();
  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
    )
    .bind(user.sub, JSON.stringify(migratedProfile), t, Number(migratedProfile.version || legacy.version || 1))
    .run();

  return migratedProfile;
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
  if (!profile) {
    const migrated = await migrateLegacyAccountByEmailShared(db, user as any);
    if (!migrated) return json({ profile: null }, 200);
    return json({ profile: migrated }, 200);
  }
  const serverPlan = await loadActivePlan(db, user.sub);
  const effectivePlan = serverPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : serverPlan;
  return json({ profile: withProtectedFields(user, { ...profile, plan: effectivePlan }) }, 200);
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
  if (!currentMeta.profile) {
    await migrateLegacyAccountByEmailShared(db, user as any);
  }
  const refreshedMeta = currentMeta.profile ? currentMeta : await loadProfileMeta(db, user.sub);
  if (refreshedMeta.profile && baseVersion > 0 && refreshedMeta.version !== baseVersion) {
    return conflictResponse(user as any, refreshedMeta.profile, refreshedMeta.version);
  }
  const directPlan = await loadActivePlan(db, user.sub);
  const effectivePlan = directPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : directPlan;
  const nextVersion = (refreshedMeta.version || 0) + 1;
  const profile = withProtectedFields(user, { ...patch, plan: effectivePlan, version: nextVersion });

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
  if (!currentMeta.profile) {
    await migrateLegacyAccountByEmailShared(db, user as any);
  }
  const baseVersion = Number((body as any).baseVersion ?? 0);
  const refreshedMeta = currentMeta.profile ? currentMeta : await loadProfileMeta(db, user.sub);
  if (refreshedMeta.profile && baseVersion > 0 && refreshedMeta.version !== baseVersion) {
    return conflictResponse(user as any, refreshedMeta.profile, refreshedMeta.version);
  }
  const directPlan = await loadActivePlan(db, user.sub);
  const effectivePlan = directPlan === 'free' ? await loadActivePlanByEmailShared(db, user.email || '') : directPlan;
  const nextVersion = (refreshedMeta.version || 0) + 1;
  const profile = withProtectedFields(user, { ...(refreshedMeta.profile ?? {}), ...patch, plan: effectivePlan, version: nextVersion });

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
