import { safeJsonParseObject } from './json';

export type AiTelemetryEnv = {
  DB?: D1Database;
  FITFOCUS_KV?: {
    get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<unknown>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
  };
};

type UsageRecord = {
  count: number;
  errorCount: number;
  totalLatency: number;
  totalBytesIn: number;
  cacheHits: number;
  lastStatus: number;
  lastTs: number;
};

export type AiEventArgs = {
  userId: string;
  feature: string;
  status: number;
  latencyMs: number;
  safeMode: boolean;
  requestJson?: unknown;
  responseJson?: unknown;
  error?: string | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  isFallback?: boolean;
};

const EMPTY_USAGE_RECORD: UsageRecord = {
  count: 0, errorCount: 0, totalLatency: 0, totalBytesIn: 0, cacheHits: 0, lastStatus: 0, lastTs: 0,
};

/** Writes privacy-safe AI delivery metrics; telemetry failures never affect a user request. */
export async function logAiEvent(env: AiTelemetryEnv, args: AiEventArgs): Promise<void> {
  try {
    if (!env.DB) return;
    const baseValues = [
      crypto.randomUUID(), args.userId, Date.now(), args.feature, args.status,
      Math.max(0, Math.round(args.latencyMs)), args.safeMode ? 1 : 0, null, null, args.error || null,
    ];
    try {
      await env.DB.prepare(
        `INSERT INTO ai_events (
          id, user_id, ts, feature, status, latency_ms, safe_mode, request_json, response_json, error,
          model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, is_fallback
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ...baseValues,
        args.model || null,
        Math.max(0, Math.round(Number(args.inputTokens || 0))),
        Math.max(0, Math.round(Number(args.outputTokens || 0))),
        Math.max(0, Math.round(Number(args.totalTokens || 0))),
        Math.max(0, Number(args.estimatedCostUsd || 0)),
        args.isFallback ? 1 : 0,
      ).run();
    } catch {
      await env.DB.prepare(
        'INSERT INTO ai_events (id, user_id, ts, feature, status, latency_ms, safe_mode, request_json, response_json, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(...baseValues).run();
    }
  } catch {
    // Telemetry cannot change the public result of AI delivery.
  }
}

/** Aggregates a compact, non-content usage record in KV without affecting AI delivery. */
export async function logAiUsage(
  env: AiTelemetryEnv,
  event: { identity: string; feature: string; status: number; latency: number; bytesIn: number; cacheHit?: boolean },
): Promise<void> {
  if (!env.FITFOCUS_KV) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = `usage:${day}:${event.identity}:${event.feature}`;
    const previousRaw = await env.FITFOCUS_KV.get(key);
    const previousParsed = typeof previousRaw === 'string' ? safeJsonParseObject(previousRaw) : null;
    const usage: UsageRecord = { ...EMPTY_USAGE_RECORD, ...(previousParsed ?? {}) };
    usage.count += 1;
    if (event.status >= 400) usage.errorCount += 1;
    usage.totalLatency += Number(event.latency) || 0;
    usage.totalBytesIn += Number(event.bytesIn) || 0;
    if (event.cacheHit) usage.cacheHits += 1;
    usage.lastStatus = event.status;
    usage.lastTs = Date.now();
    await env.FITFOCUS_KV.put(key, JSON.stringify(usage), { expirationTtl: 60 * 60 * 24 * 7 });
  } catch {
    // Telemetry cannot change the public result of AI delivery.
  }
}