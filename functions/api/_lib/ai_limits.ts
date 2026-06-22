import type { ActivePlan } from "./plans";

export type AiLimitKind = "cooldown" | "burst" | "daily";

export class AiLimitError extends Error {
  code: string;
  kind: AiLimitKind;
  status: number;
  meta: Record<string, unknown>;

  constructor(code: string, kind: AiLimitKind, status: number, message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.name = "AiLimitError";
    this.code = code;
    this.kind = kind;
    this.status = status;
    this.meta = meta;
  }
}

export interface AiRateControlInput {
  db: D1Database;
  userId: string;
  feature: string;
  plan: ActivePlan;
  planDailyLimit: number | null;
  safeDailyLimit?: number | null;
  nowMs?: number;
  cooldownMs?: number;
  burstLimit?: number;
  burstWindowMs?: number;
}

function sanitizeFeature(value: string): string {
  return String(value || "ai").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 64) || "ai";
}

function changesOf(result: any): number {
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  return Number.isFinite(changes) ? changes : 0;
}

function utcDayKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function minLimit(a: number | null | undefined, b: number | null | undefined): number | null {
  const limits = [a, b].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (!limits.length) return null;
  return Math.min(...limits);
}

async function ensureRateBucket(
  db: D1Database,
  bucketKey: string,
  userId: string,
  feature: string,
  kind: AiLimitKind,
  windowStartMs: number,
  updatedAt: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO ai_rate_limits
        (bucket_key, user_id, feature, kind, window_start_ms, count, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .bind(bucketKey, userId, feature, kind, windowStartMs, updatedAt)
    .run();
}

async function enforceCooldown(db: D1Database, userId: string, feature: string, nowMs: number, cooldownMs: number) {
  if (cooldownMs <= 0) return;
  const bucketKey = `cooldown:${userId}:${feature}`;
  await ensureRateBucket(db, bucketKey, userId, feature, "cooldown", 0, 0);

  const result = await db
    .prepare(
      `UPDATE ai_rate_limits
       SET count = count + 1, updated_at = ?
       WHERE bucket_key = ? AND updated_at <= ?`
    )
    .bind(nowMs, bucketKey, nowMs - cooldownMs)
    .run();

  if (changesOf(result) < 1) {
    throw new AiLimitError(
      "AI_COOLDOWN",
      "cooldown",
      429,
      "Слишком частые AI-запросы. Подождите несколько секунд.",
      { retryAfterMs: cooldownMs, feature },
    );
  }
}

async function enforceBurst(db: D1Database, userId: string, feature: string, nowMs: number, burstLimit: number, burstWindowMs: number) {
  if (burstLimit <= 0 || burstWindowMs <= 0) return;
  const windowStartMs = Math.floor(nowMs / burstWindowMs) * burstWindowMs;
  const bucketKey = `burst:${userId}:${feature}:${windowStartMs}`;
  await ensureRateBucket(db, bucketKey, userId, feature, "burst", windowStartMs, nowMs);

  const result = await db
    .prepare(
      `UPDATE ai_rate_limits
       SET count = count + 1, updated_at = ?
       WHERE bucket_key = ? AND count < ?`
    )
    .bind(nowMs, bucketKey, burstLimit)
    .run();

  if (changesOf(result) < 1) {
    throw new AiLimitError(
      "AI_BURST_LIMIT",
      "burst",
      429,
      "Слишком много AI-запросов за короткое время. Попробуйте позже.",
      { limit: burstLimit, windowMs: burstWindowMs, feature },
    );
  }
}

async function recordDailyUsage(
  db: D1Database,
  userId: string,
  feature: string,
  nowMs: number,
  limit: number | null,
  plan: ActivePlan,
  planDailyLimit: number | null,
  safeDailyLimit: number | null,
) {
  const day = utcDayKey(nowMs);
  const usageFeature = `ai_${feature}`;

  await db
    .prepare("INSERT OR IGNORE INTO usage_daily (user_id, day, feature, count) VALUES (?, ?, ?, 0)")
    .bind(userId, day, usageFeature)
    .run();

  if (limit === null) {
    await db
      .prepare("UPDATE usage_daily SET count = count + 1 WHERE user_id = ? AND day = ? AND feature = ?")
      .bind(userId, day, usageFeature)
      .run();
    return;
  }

  const result = await db
    .prepare(
      `UPDATE usage_daily
       SET count = count + 1
       WHERE user_id = ? AND day = ? AND feature = ? AND count < ?`
    )
    .bind(userId, day, usageFeature, limit)
    .run();

  if (changesOf(result) >= 1) return;

  const row = await db
    .prepare("SELECT count FROM usage_daily WHERE user_id = ? AND day = ? AND feature = ?")
    .bind(userId, day, usageFeature)
    .first<{ count?: number }>();

  const isPaywallLimit = planDailyLimit !== null && planDailyLimit <= limit;
  throw new AiLimitError(
    isPaywallLimit ? "PAYWALL" : "DAILY_LIMIT",
    "daily",
    isPaywallLimit ? 402 : 429,
    isPaywallLimit
      ? plan === "free"
        ? `Free лимит AI достигнут: ${planDailyLimit}/день. Перейдите на Pro или Family для расширенного доступа.`
        : `Лимит AI для тарифа ${plan} достигнут: ${planDailyLimit}/день.`
      : "Достигнут временный безопасный лимит AI. Попробуйте позже.",
    {
      day,
      feature,
      plan,
      usedToday: Number(row?.count || limit),
      limitPerDay: limit,
      planDailyLimit,
      safeDailyLimit,
    },
  );
}

export async function enforceAiRateControls(input: AiRateControlInput): Promise<void> {
  const feature = sanitizeFeature(input.feature);
  const nowMs = input.nowMs || Date.now();
  const cooldownMs = input.cooldownMs ?? 4_000;
  const burstLimit = input.burstLimit ?? 20;
  const burstWindowMs = input.burstWindowMs ?? 10 * 60_000;
  const safeDailyLimit = input.safeDailyLimit ?? null;
  const effectiveDailyLimit = minLimit(input.planDailyLimit, safeDailyLimit);

  await enforceCooldown(input.db, input.userId, feature, nowMs, cooldownMs);
  await enforceBurst(input.db, input.userId, feature, nowMs, burstLimit, burstWindowMs);
  await recordDailyUsage(
    input.db,
    input.userId,
    feature,
    nowMs,
    effectiveDailyLimit,
    input.plan,
    input.planDailyLimit,
    safeDailyLimit,
  );
}

export async function cleanupOldAiRateLimitBuckets(db: D1Database, olderThanMs: number, limit = 500): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM ai_rate_limits
       WHERE bucket_key IN (
         SELECT bucket_key FROM ai_rate_limits WHERE updated_at < ? LIMIT ?
       )`
    )
    .bind(olderThanMs, Math.max(1, Math.min(5000, Math.floor(limit))))
    .run();
  return changesOf(result);
}
