// Cloudflare Pages Function: /api/wearable/sync
// Accepts wearable snapshots from an iOS bridge (Apple Health / HealthKit)
// or other providers and writes the normalized data into the user profile.

import { requireUser, json } from "../_lib/auth";
import { requireBetaAccess } from "../_lib/access";
import { requireDB, nowMs } from "../_lib/db";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };

type WearableProvider = "apple_health" | "google_fit" | "fitbit" | "garmin" | "manual";

const ALLOWED_PROVIDERS = new Set<WearableProvider>(["apple_health", "google_fit", "fitbit", "garmin", "manual"]);

function parseNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function sanitizeProvider(value: unknown): WearableProvider {
  const provider = String(value || "manual").toLowerCase();
  if (ALLOWED_PROVIDERS.has(provider as WearableProvider)) return provider as WearableProvider;
  return "manual";
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

async function loadProfileMeta(db: D1Database, userId: string): Promise<{ profile: Record<string, unknown> | null; version: number }> {
  const row = await db
    .prepare("SELECT profile_json, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json?: string; version?: number }>();

  if (!row?.profile_json) return { profile: null, version: 0 };
  try {
    const parsed = JSON.parse(String(row.profile_json)) as Record<string, unknown>;
    return {
      profile: parsed && typeof parsed === "object" ? parsed : null,
      version: Number(row.version || 1),
    };
  } catch {
    return { profile: null, version: Number(row?.version || 0) };
  }
}

function withProtectedFields(
  user: { sub: string; email?: string; name?: string; picture?: string },
  profile: Record<string, unknown>,
) {
  const plan = String(profile.plan || "free");
  const normalizedPlan = plan === "pro" || plan === "family" ? plan : "free";
  return {
    ...profile,
    id: user.sub,
    googleSub: user.sub,
    email: user.email,
    name: typeof profile.name === "string" && profile.name.trim().length ? profile.name : (user.name ?? "Пользователь"),
    picture: profile.picture ?? user.picture,
    plan: normalizedPlan,
    planTier: normalizedPlan === "free" ? "free" : "pro",
    version: typeof profile.version === "number" ? profile.version : Number(profile.version || 1),
  };
}

function conflictResponse(user: { sub: string; email?: string; name?: string; picture?: string }, profile: Record<string, unknown>, version: number) {
  const serverProfile = withProtectedFields(user, { ...profile, version });
  return json({ error: "PROFILE_CONFLICT", profile: serverProfile, version }, 409);
}

function pushWeightHistory(profile: Record<string, unknown>, weight: number, date: string) {
  const history = Array.isArray(profile.weightHistory) ? [...profile.weightHistory] : [];
  return [{ date, weight }, ...history].slice(0, 120);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  try {
    await requireBetaAccess(env as any, user as any);
  } catch {
    return json({ error: "ACCESS_REQUIRED" }, 403);
  }

  const db = requireDB(env);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "BAD_JSON" }, 400);

  const provider = sanitizeProvider(body.provider);
  const timestamp = typeof body.date === "string" && body.date.trim() ? body.date : (typeof body.metricsUpdatedAt === "string" && body.metricsUpdatedAt.trim() ? body.metricsUpdatedAt : new Date().toISOString());
  const stepsToday = parseNumber(body.stepsToday ?? body.steps);
  const activeMinutesToday = parseNumber(body.activeMinutesToday ?? body.activeMinutes ?? body.moveMinutes);
  const sleepHoursLastNight = parseNumber(body.sleepHoursLastNight ?? body.sleepHours);
  const restingPulse = parseNumber(body.restingPulse ?? body.pulse);
  const weight = parseNumber(body.weight);

  if (
    typeof stepsToday !== "number" &&
    typeof activeMinutesToday !== "number" &&
    typeof sleepHoursLastNight !== "number" &&
    typeof restingPulse !== "number" &&
    typeof weight !== "number"
  ) {
    return json({ error: "NO_WEARABLE_DATA" }, 400);
  }

  const currentMeta = await loadProfileMeta(db, user.sub);
  const baseVersion = Number(body.baseVersion ?? 0);
  if (currentMeta.profile && baseVersion > 0 && currentMeta.version !== baseVersion) {
    return conflictResponse(user as any, currentMeta.profile, currentMeta.version);
  }

  const currentProfile = currentMeta.profile ?? {};
  const serverPlan = await loadActivePlan(db, user.sub);
  const now = nowMs();
  const nextVersion = (currentMeta.version || 0) + 1;
  const nextProfile: Record<string, unknown> = withProtectedFields(user as any, {
    ...currentProfile,
    plan: serverPlan,
    version: nextVersion,
    wearableProvider: provider,
    wearableEnabled: true,
    wearableConnectedAt: (currentProfile as any).wearableConnectedAt || timestamp,
    wearableLastSyncAt: timestamp,
    wearableMetricsUpdatedAt: timestamp,
    ...(typeof stepsToday === "number" ? { wearableStepsToday: Math.round(stepsToday) } : {}),
    ...(typeof activeMinutesToday === "number" ? { wearableActiveMinutesToday: Math.round(activeMinutesToday) } : {}),
    ...(typeof sleepHoursLastNight === "number" ? { wearableSleepHoursLastNight: Number(sleepHoursLastNight.toFixed(1)) } : {}),
    ...(typeof restingPulse === "number" && restingPulse > 0 ? { restingPulse: Math.round(restingPulse), restingPulseMeasuredAt: timestamp } : {}),
    ...(typeof weight === "number" && weight > 0 ? { weight, weightHistory: pushWeightHistory(currentProfile, weight, timestamp) } : {}),
  });

  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
    )
    .bind(user.sub, JSON.stringify(nextProfile), now, nextVersion)
    .run();

  return json(
    {
      profile: nextProfile,
      updatedFields: Object.keys({
        ...(typeof stepsToday === "number" ? { wearableStepsToday: true } : {}),
        ...(typeof activeMinutesToday === "number" ? { wearableActiveMinutesToday: true } : {}),
        ...(typeof sleepHoursLastNight === "number" ? { wearableSleepHoursLastNight: true } : {}),
        ...(typeof restingPulse === "number" && restingPulse > 0 ? { restingPulse: true } : {}),
        ...(typeof weight === "number" && weight > 0 ? { weight: true } : {}),
      }),
      source: provider,
      version: nextVersion,
    },
    200
  );
};

