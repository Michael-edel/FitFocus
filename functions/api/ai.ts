import { requireUser, json as jsonV } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { loadFeatures, isEnabled, loadSettings, getSetting, getSettingNumber } from "./_lib/features";
import { requireDB } from "./_lib/db";
import { dailyAiLimitForPlan, loadActivePlan } from "./_lib/plans";
import { AiLimitError, enforceAiRateControls } from "./_lib/ai_limits";
import { checkAiBudgetGuard } from './_lib/ai_budget_guard';
import { buildAiFallback, loadAiFallbackProfile, shouldUseAiFallback } from './_lib/ai_fallback';
import { buildOpenAiProviderPayload, normalizeAiContents } from './_lib/ai_provider_payload';
import { estimateAiProviderCostUsd, extractAiProviderText, getAiProviderUsage } from './_lib/ai_provider_response';
import {
  classifyAiFetchFailure,
  getAiProviderErrorMessage,
  isGeminiModelAvailabilityError,
  normalizeGeminiTimeoutMs,
  requestAiProvider,
  type AiProviderResponse,
} from './_lib/ai_provider_request';
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';
import { logAiEvent, logAiUsage } from './_lib/ai_telemetry';
import { readAiDedupCache, writeAiDedupCache } from './_lib/ai_dedup_cache';
import { readRequestText, RequestBodyTooLargeError } from "./_lib/request_body";
import { isJsonObject, safeJsonParse, type JsonObject } from "./_lib/json";
import {
  AI_ALLOWED_MODELS,
  AI_DEFAULT_MODEL,
  GEMINI_ALLOWED_MODELS,
  getAiFallbackModels,
} from "../../aiModels";

type JsonRecord = JsonObject;
export { buildFallbackAdvice, calcTargetCalories } from './_lib/ai_fallback';
export { isGeminiModelAvailabilityError, normalizeGeminiTimeoutMs };


/**
 * FITFOCUS v18_USER_LIMITS_NO_JOSE
 * - Limits scoped to authenticated userId (ff_session) with IP fallback
 * - Rate limit + daily limit + dedup cache (KV)
 * - Normalizes contents for Gemini
 * - Maps client 'config' -> Gemini 'generationConfig'
 * - No external deps.
 */

export interface Env {
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  FITFOCUS_KV?: {
    get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<unknown>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
  };
  IP_HASH_SALT?: string;
  FREE_AI_DAILY_LIMIT?: string;
  PRO_AI_DAILY_LIMIT?: string;
  FAMILY_AI_DAILY_LIMIT?: string;
  AUTH_JWT_SECRET?: string;
  GEMINI_TIMEOUT_MS?: string;
}
const DEFAULT_GEMINI_MODEL = AI_DEFAULT_MODEL;
const ALLOWED_GEMINI_MODELS = new Set<string>([
  ...AI_ALLOWED_MODELS,
  ...GEMINI_ALLOWED_MODELS,
]);
export function resolveGeminiModel(value: unknown): string {
  const model = String(value || "").trim();
  return ALLOWED_GEMINI_MODELS.has(model) ? model : DEFAULT_GEMINI_MODEL;
}

export function resolveGeminiFallbackModels(model: string): string[] {
  return getAiFallbackModels(model);
}

function jsonResponse(obj: unknown, status = 200, extraHeaders: Record<string,string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function getSettingNumberOrDefault(settings: Record<string, string>, key: string, fallback: number) {
  const raw = getSetting(settings, key, "");
  if (raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function handleAiPost({ request, env }: { request: Request; env: Env }) {
  const startedAt = Date.now();

  // Enterprise Layer: require authenticated user (server-driven)
  let user;
  try { user = await requireUser(request, env); } catch { return jsonV({ error: "UNAUTH" }, 401); }
  try { await requireBetaAccess(env, user); } catch { return jsonV({ error: "ACCESS_REQUIRED", message: "Доступ к beta AI открыт только тестерам с активированным кодом приглашения." }, 403); }
  let bodyText = "";
  let body: JsonObject = {};
  try {
    bodyText = await readRequestText(request, 4 * 1024 * 1024);
    const parsedBody = bodyText ? safeJsonParse(bodyText) : {};
    if (parsedBody !== null && isJsonObject(parsedBody)) {
      body = parsedBody;
    } else if (bodyText.trim()) {
      return jsonResponse({ error: { message: "Invalid JSON body" } }, 400);
    }
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return jsonResponse({ error: { message: "Payload too large" } }, 413);
    }
    return jsonResponse({ error: { message: "Invalid JSON body" } }, 400);
  }

  const feature = (typeof body?.feature === "string" && body.feature.trim()) ? body.feature.trim() : "ai";

  const features = await loadFeatures(env, String(user.sub));
  const settings = await loadSettings(env);
  const budgetGuardEnabled = isEnabled(features, "ai_budget_guard_enabled", false);
  const emergencyFallback = isEnabled(features, "ai_emergency_fallback", false);
  const onLimitAction = (getSetting(settings, "ai_on_limit_action", "fallback") || "fallback").toLowerCase();
  const maxCallsPerUserDay = Math.max(0, Math.floor(getSettingNumber(settings, "ai_max_calls_per_user_day", 0)));
  const maxCostPerUserDay = Math.max(0, getSettingNumber(settings, "ai_max_cost_per_user_day_usd", 0));
  const maxCostTotalDay = Math.max(0, getSettingNumber(settings, "ai_max_cost_total_day_usd", 0));
  const inputCostPerMillion = Math.max(0, getSettingNumberOrDefault(settings, "ai_cost_input_per_1m_usd", 0.20));
  const outputCostPerMillion = Math.max(0, getSettingNumberOrDefault(settings, "ai_cost_output_per_1m_usd", 1.20));

  // UTC day start (ms)
  const now = Date.now();
  const d0 = new Date(now);
  const dayStart = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate())).getTime();
  const safeMode = isEnabled(features, "ai_safe_mode", false);
  const fallbackMode = isEnabled(features, "ai_fallback_mode", true);

  // Emergency: force fallback for everyone (kill switch)
  if (emergencyFallback) {
    const profile = await loadAiFallbackProfile(env.DB, String(user.sub));
    const fallback = buildAiFallback(feature, profile);
    await logAiEvent(env, { userId: String(user.sub), feature, status: 200, latencyMs: 0, safeMode, requestJson: body, responseJson: fallback, error: null, model: "fallback_emergency", isFallback: true });
    return jsonResponse({ ...fallback, text: JSON.stringify(fallback) }, 200, { "X-FF-AI-Fallback": "1" });
  }

  // Budget Guard (admin-managed)
  if (budgetGuardEnabled && (maxCallsPerUserDay > 0 || maxCostPerUserDay > 0 || maxCostTotalDay > 0)) {
    try {
      const db = requireDB(env);

      const budget = await checkAiBudgetGuard({
        db,
        userId: String(user.sub),
        dayStart,
        maxCallsPerUserDay,
        maxCostPerUserDay,
        maxCostTotalDay,
      });
      if (budget.exceeded) {
        const { exceedCalls, exceedUserCost, exceedTotalCost } = budget;
        if (onLimitAction === "block") {
          return jsonV({ error: "AI_LIMIT", message: "Достигнут лимит использования AI. Попробуйте позже.", meta: { exceedCalls, exceedUserCost, exceedTotalCost } }, 429);
        }
        // default: fallback
        const profile = await loadAiFallbackProfile(env.DB, String(user.sub));
        const fallback = buildAiFallback(feature, profile);
        await logAiEvent(env, { userId: String(user.sub), feature, status: 200, latencyMs: 0, safeMode, requestJson: body, responseJson: fallback, error: null, model: "fallback_budget_guard", inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, isFallback: true });
        return jsonV({ ok: true, data: fallback, fallback: true, limited: true, meta: { exceedCalls, exceedUserCost, exceedTotalCost } }, 200);
      }
    } catch {
      // Do not call the paid provider when the server cannot verify the budget.
      return jsonV({ error: "AI_BUDGET_UNAVAILABLE", message: "Сервис AI временно недоступен. Попробуйте позже." }, 503);
    }
  }

  const model = resolveGeminiModel(body?.model);
  const usesOpenAiModel = model.startsWith("gpt-");
  const openAiApiKey = String(env.OPENAI_API_KEY || "").trim();
  const geminiApiKey = env.GEMINI_API_KEY || (env as Env & { API_KEY?: string; GOOGLE_API_KEY?: string }).API_KEY || (env as Env & { API_KEY?: string; GOOGLE_API_KEY?: string }).GOOGLE_API_KEY;
  const apiKey = usesOpenAiModel ? openAiApiKey : geminiApiKey;
  const kv = env.FITFOCUS_KV;
  const identity = String(user?.sub || "");

  if (!apiKey) {
    await logAiUsage(env, { identity, feature, status: 500, latency: Date.now() - startedAt, bytesIn: bodyText.length });
    return jsonResponse({ error: { code: "AI_UNAVAILABLE", message: "AI-сервис временно недоступен. Попробуйте позже." } }, 500);
  }

  const db = requireDB(env);
  const activePlan = await loadActivePlan(db, String(user.sub));

  // Strict backend controls: D1 is the source of truth for AI cooldown, burst and daily quota.
  // KV remains only for non-critical dedup/cache telemetry below.
  try {
    await enforceAiRateControls({
      db,
      userId: identity,
      feature,
      plan: activePlan,
      planDailyLimit: dailyAiLimitForPlan(activePlan, env),
      safeDailyLimit: safeMode ? (activePlan === "free" ? 50 : 200) : null,
    });
  } catch (error: unknown) {
    if (error instanceof AiLimitError || (error instanceof Error && error.name === "AiLimitError")) {
      const aiError = error as AiLimitError;
      const status = Number(aiError.status || 429);
      await logAiUsage(env, { identity, feature, status, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      await logAiEvent(env, {
        userId: identity,
        feature,
        status,
        latencyMs: Date.now() - startedAt,
        safeMode,
        requestJson: body,
        error: aiError.code || "AI_LIMIT",
      });
      return jsonResponse({
        error: {
          code: aiError.code || "AI_LIMIT",
          message: aiError.message || "Достигнут лимит AI.",
          meta: aiError.meta || { feature, plan: activePlan },
        },
      }, status, aiError.kind === "daily" ? { "X-FF-Quota": "EXCEEDED" } : {});
    }
    throw error;
  }

  const bodyHash = await sha256Hex(bodyText || "{}");
  const dedupKey = `dedup:60s:${identity}:${feature}:${bodyHash}`;

  const cached = await readAiDedupCache(kv, dedupKey);
  if (isJsonObject(cached) && "data" in cached) {
    const cachedStatus = Number(cached.status || 200);
    await logAiUsage(env, { identity, feature, status: cachedStatus, latency: Date.now() - startedAt, bytesIn: bodyText.length, cacheHit: true });
    return new Response(JSON.stringify(cached.data), {
      status: cachedStatus,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-FF-Cache": "HIT" },
    });
  }

  const { feature: _drop, model: _model, ...payload } = body ?? {};
  const payloadToSend: Record<string, unknown> = (payload && typeof payload === "object") ? { ...payload } : {};

  if ("config" in payloadToSend && !("generationConfig" in payloadToSend)) {
    payloadToSend.generationConfig = payloadToSend.config;
  }
  if ("config" in payloadToSend) {
    delete payloadToSend.config;
  }

  if (safeMode) {
    const generationConfig = isJsonObject(payloadToSend.generationConfig) ? payloadToSend.generationConfig : {};
    payloadToSend.generationConfig = generationConfig;
    // Conservative defaults to reduce latency/cost and force structured output
    if (generationConfig.maxOutputTokens == null) generationConfig.maxOutputTokens = 900;
    if (generationConfig.temperature == null) generationConfig.temperature = 0.4;
    // Encourage JSON-only outputs
    if (generationConfig.responseMimeType == null) generationConfig.responseMimeType = "application/json";
  }

  if ("contents" in payloadToSend) {
    const normalized = normalizeAiContents(payloadToSend.contents);
    if (!normalized.length) {
      await logAiUsage(env, { identity, feature, status: 400, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return jsonResponse({
        error: { message: "Invalid contents: expected string or Content/Content[] with parts[]. Use {contents:[{role:'user',parts:[{text:'...'}]}]}" }
      }, 400);
    }
    payloadToSend.contents = normalized;
  }

  const upstreamPayload = usesOpenAiModel
    ? buildOpenAiProviderPayload(payloadToSend, model)
    : payloadToSend;

  let geminiResp: Response | null = null;
  let data: AiProviderResponse = {};
  let effectiveModel = model;
  let latency = 0;
  const geminiTimeoutMs = normalizeGeminiTimeoutMs(env.GEMINI_TIMEOUT_MS);

  try {
    const providerResult = await requestAiProvider({
      model,
      apiKey,
      payload: upstreamPayload,
      timeoutMs: geminiTimeoutMs,
    });
    geminiResp = providerResult.response;
    data = providerResult.data;
    effectiveModel = providerResult.effectiveModel;
    latency = Date.now() - startedAt;
  } catch (error: unknown) {
    latency = Date.now() - startedAt;
    const errorCode = classifyAiFetchFailure(error);

    if (fallbackMode) {
      const profile = await loadAiFallbackProfile(env.DB, String(user.sub));
      const fallback = buildAiFallback(feature, profile);
      await logAiEvent(env, {
        userId: String(user.sub),
        feature,
        status: 200,
        latencyMs: latency,
        safeMode,
        requestJson: body,
        responseJson: fallback,
        error: errorCode,
        model: "fallback_fetch_failed",
        isFallback: true,
      });
      return new Response(JSON.stringify({ ...fallback, text: JSON.stringify(fallback) }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-FF-AI-Fallback": "1",
          "X-FF-Cache": "MISS",
          "X-FF-KV": kv ? "found" : "missing",
        },
      });
    }

    await logAiEvent(env, { userId: String(user.sub), feature, status: 500, latencyMs: latency, safeMode, requestJson: body, responseJson: null, error: errorCode });
    return jsonResponse({ error: { message: "AI request failed" } }, 500);
  }


  // --- Compatibility layer -------------------------------------------------
  // UI (geminiService.ts) historically ожидает поле `text`.
  // Gemini API обычно возвращает: candidates[].content.parts[].text
  const extractedText = extractAiProviderText(data);
  // Fallback on quota/5xx: return a deterministic plan instead of breaking the product.
  if (fallbackMode && (shouldUseAiFallback(geminiResp!.status) || isGeminiModelAvailabilityError(geminiResp!.status, data))) {
    const profile = await loadAiFallbackProfile(env.DB, String(user.sub));
    const fallback = buildAiFallback(feature, profile);
    await logAiEvent(env, {
      userId: String(user.sub),
      feature,
      status: 200,
      latencyMs: latency,
      safeMode,
      requestJson: body,
      responseJson: fallback,
        error: getAiProviderErrorMessage(data.error, `status_${geminiResp!.status}`),
      model: "fallback_status",
      isFallback: true,
    });
    return new Response(JSON.stringify({ ...fallback, text: JSON.stringify(fallback) }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-FF-AI-Fallback": "1",
        "X-FF-Cache": "MISS",
        "X-FF-KV": kv ? "found" : "missing",
      },
    });
  }


  await writeAiDedupCache(kv, dedupKey, { status: geminiResp.status, data });
  await logAiUsage(env, { identity, feature, status: geminiResp.status, latency, bytesIn: bodyText.length });

  
  const usage = getAiProviderUsage(data);
  await logAiEvent(env, {
    userId: String(user.sub),
    feature,
    status: geminiResp.status,
    latencyMs: latency,
    safeMode,
    requestJson: body,
    responseJson: { text: extractedText },
    error: geminiResp.status >= 400 ? getAiProviderErrorMessage(data.error, "") || null : null,
      model: effectiveModel,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: estimateAiProviderCostUsd(usage.inputTokens, usage.outputTokens, inputCostPerMillion, outputCostPerMillion),
    isFallback: false,
  });
return new Response(JSON.stringify({ ...data, text: extractedText }), {
    status: geminiResp.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-FF-Cache": "MISS",
      "X-FF-KV": kv ? "found" : "missing"
    },
  });
}

/** Adds a correlation identifier to every AI response without logging user content. */
export async function onRequestPost(context: { request: Request; env: Env }) {
  const response = await handleAiPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('ai.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
}
