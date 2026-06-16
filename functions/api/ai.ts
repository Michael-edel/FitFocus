import { requireUser, json as jsonV } from "./_lib/auth";
import { requireBetaAccess } from "./_lib/access";
import { loadFeatures, isEnabled, loadSettings, getSetting, getSettingNumber } from "./_lib/features";
import { requireDB } from "./_lib/db";


/**
 * FITFOCUS v18_USER_LIMITS_NO_JOSE
 * - Limits scoped to authenticated userId (ff_session) with IP fallback
 * - Rate limit + daily limit + dedup cache (KV)
 * - Normalizes contents for Gemini
 * - Maps client 'config' -> Gemini 'generationConfig'
 * - No external deps.
 */

export interface Env {
  DB?: any;
  GEMINI_API_KEY: string;
  FITFOCUS_KV?: any;
  IP_HASH_SALT?: string;
  FREE_AI_DAILY_LIMIT?: string;
  AUTH_JWT_SECRET?: string;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiContent = {
  role?: "user" | "model";
  parts: GeminiPart[];
};

function b64urlEncode(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return b64;
}

function b64urlDecodeToBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

async function hmacVerify(secret: string, data: string, signatureB64Url: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = b64urlDecodeToBytes(signatureB64Url);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
}

function jsonResponse(obj: any, status = 200, extraHeaders: Record<string,string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function getGeminiUsage(data: any) {
  const usage = data?.usageMetadata || {};
  const inputTokens = Number(usage.promptTokenCount || 0);
  const outputTokens = Number(usage.candidatesTokenCount || 0);
  const totalTokens = Number(usage.totalTokenCount || inputTokens + outputTokens || 0);
  return { inputTokens, outputTokens, totalTokens };
}

function estimateCostUsd(inputTokens: number, outputTokens: number, inputPerMillion: number, outputPerMillion: number) {
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

function getCookie(req: Request, name: string) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(^|;\\s*)" + name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

async function verifySessionJwt(token: string, secret: string): Promise<any|null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const ok = await hmacVerify(secret, `${h}.${p}`, s);
  if (!ok) return null;
  try {
    const payloadJson = new TextDecoder().decode(b64urlDecodeToBytes(p));
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload?.exp === "number" && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

async function signSessionJwt(payload: any, secret: string, expiresInSeconds: number) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };

  const h = b64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const p = b64urlEncode(new TextEncoder().encode(JSON.stringify(body)));
  const sig = await hmacSign(secret, `${h}.${p}`);
  return `${h}.${p}.${sig}`;
}

function normalizeContents(input: any): GeminiContent[] {
  const toTextContent = (t: string): GeminiContent => ({
    role: "user",
    parts: [{ text: t }],
  });

  const isPart = (p: any): p is GeminiPart =>
    !!p &&
    (typeof p?.text === "string" ||
      (p?.inlineData &&
        typeof p.inlineData?.mimeType === "string" &&
        typeof p.inlineData?.data === "string"));

  const toContent = (c: any): GeminiContent | null => {
    if (!c) return null;

    if (Array.isArray(c?.parts) && c.parts.every(isPart)) {
      const role = c.role === "model" ? "model" : "user";
      return { role, parts: c.parts };
    }

    if (isPart(c)) {
      return { role: "user", parts: [c] };
    }

    if (typeof c === "string") return toTextContent(c);
    if (typeof c?.text === "string") return toTextContent(c.text);

    return null;
  };

  if (typeof input === "string") return [toTextContent(input)];

  if (Array.isArray(input)) {
    const out: GeminiContent[] = [];
    for (const item of input) {
      const cc = toContent(item);
      if (cc) out.push(cc);
    }
    return out;
  }

  const single = toContent(input);
  if (single) return [single];

  return [];
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function resolveIdentityKey(request: Request, env: Env) {
  const token = getCookie(request, "ff_session");
  if (token && env.AUTH_JWT_SECRET) {
    const payload = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
    const uid = payload?.uid;
    if (uid) return `user:${uid}`;
  }
  const ipRaw = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256Hex(`${env.IP_HASH_SALT || "ff"}:${ipRaw}`);
  return `ip:${ipHash}`;
}


async function enforceDailyLimit(db: any, userId: string, feature: string, limit: number): Promise<void> {
  if (!db) return;
  const d = new Date();
  const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  const row = await db.prepare("SELECT count FROM usage_daily WHERE user_id = ? AND day = ? AND feature = ?")
    .bind(userId, day, feature).first();
  const current = Number(row?.count || 0);
  if (current >= limit) {
    const err: any = new Error("DAILY_LIMIT");
    err.code = "DAILY_LIMIT";
    throw err;
  }
  await db.prepare(
    "INSERT INTO usage_daily (user_id, day, feature, count) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day, feature) DO UPDATE SET count = count + 1"
  ).bind(userId, day, feature).run();
}

async function logAiEvent(env: any, args: {
  userId: string;
  feature: string;
  status: number;
  latencyMs: number;
  safeMode: boolean;
  requestJson?: any;
  responseJson?: any;
  error?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  isFallback?: boolean;
}) {
  try {
    if (!env?.DB) return;
    const id = crypto.randomUUID();
    const ts = Date.now();
    const reqStr = args.requestJson ? JSON.stringify(args.requestJson).slice(0, 40000) : null;
    const resStr = args.responseJson ? JSON.stringify(args.responseJson).slice(0, 40000) : null;
    const baseValues = [
      id,
      args.userId,
      ts,
      args.feature,
      args.status,
      Math.max(0, Math.round(args.latencyMs)),
      args.safeMode ? 1 : 0,
      reqStr,
      resStr,
      args.error || null
    ];
    try {
      await env.DB.prepare(
        `INSERT INTO ai_events (
          id, user_id, ts, feature, status, latency_ms, safe_mode, request_json, response_json, error,
          model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, is_fallback
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        ...baseValues,
        args.model || null,
        Math.max(0, Math.round(Number(args.inputTokens || 0))),
        Math.max(0, Math.round(Number(args.outputTokens || 0))),
        Math.max(0, Math.round(Number(args.totalTokens || 0))),
        Math.max(0, Number(args.estimatedCostUsd || 0)),
        args.isFallback ? 1 : 0
      ).run();
    } catch {
      await env.DB.prepare(
        "INSERT INTO ai_events (id, user_id, ts, feature, status, latency_ms, safe_mode, request_json, response_json, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(...baseValues).run();
    }
  } catch {
    // never break request
  }
}
async function logUsage(
  env: Env,
  ev: { identity: string; feature: string; status: number; latency: number; bytesIn: number; cacheHit?: boolean }
) {
  if (!env.FITFOCUS_KV) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = `usage:${day}:${ev.identity}:${ev.feature}`;

    const prevRaw = await env.FITFOCUS_KV.get(key);
    const prev = prevRaw ? JSON.parse(prevRaw) : { count: 0, errorCount: 0, totalLatency: 0, totalBytesIn: 0, cacheHits: 0, lastStatus: 0, lastTs: 0 };

    prev.count += 1;
    if (ev.status >= 400) prev.errorCount += 1;
    prev.totalLatency += Number(ev.latency) || 0;
    prev.totalBytesIn += Number(ev.bytesIn) || 0;
    if (ev.cacheHit) prev.cacheHits += 1;
    prev.lastStatus = ev.status;
    prev.lastTs = Date.now();

    await env.FITFOCUS_KV.put(key, JSON.stringify(prev), { expirationTtl: 60 * 60 * 24 * 7 });
  } catch {
    // never break request
  }
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const startedAt = Date.now();

  // Enterprise Layer: require authenticated user (server-driven)
  let user: any;
  try { user = await requireUser(request, env as any); } catch { return jsonV({ error: "UNAUTH" }, 401); }
  try { await requireBetaAccess(env as any, user); } catch { return jsonV({ error: "ACCESS_REQUIRED", message: "Доступ к beta AI открыт только тестерам с активированным кодом приглашения." }, 403); }
  let bodyText = "";
  let body: any = null;
  try {
    bodyText = await request.text();
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return jsonResponse({ error: { message: "Invalid JSON body" } }, 400);
  }

  const feature = (typeof body?.feature === "string" && body.feature.trim()) ? body.feature.trim() : "ai";

  const features = await loadFeatures(env as any);
  const settings = await loadSettings(env as any);
  const budgetGuardEnabled = isEnabled(features, "ai_budget_guard_enabled", false);
  const emergencyFallback = isEnabled(features, "ai_emergency_fallback", false);
  const onLimitAction = (getSetting(settings, "ai_on_limit_action", "fallback") || "fallback").toLowerCase();
  const maxCallsPerUserDay = Math.max(0, Math.floor(getSettingNumber(settings, "ai_max_calls_per_user_day", 0)));
  const maxCostPerUserDay = Math.max(0, getSettingNumber(settings, "ai_max_cost_per_user_day_usd", 0));
  const maxCostTotalDay = Math.max(0, getSettingNumber(settings, "ai_max_cost_total_day_usd", 0));
  const inputCostPerMillion = Math.max(0, getSettingNumber(settings, "ai_cost_input_per_1m_usd", 0));
  const outputCostPerMillion = Math.max(0, getSettingNumber(settings, "ai_cost_output_per_1m_usd", 0));

  // UTC day start (ms)
  const now = Date.now();
  const d0 = new Date(now);
  const dayStart = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate())).getTime();
  const safeMode = isEnabled(features, "ai_safe_mode", false);
  const fallbackMode = isEnabled(features, "ai_fallback_mode", true);

  // Emergency: force fallback for everyone (kill switch)
  if (emergencyFallback) {
    const profile = await loadUserProfile(env as any, String(user.sub));
    const fallback = buildFallback(feature, profile);
    await logAiEvent(env as any, { userId: String(user.sub), feature, status: 200, latencyMs: 0, safeMode, requestJson: body, responseJson: fallback, error: null, model: "fallback_emergency", isFallback: true });
    return jsonResponse({ ...fallback, text: JSON.stringify(fallback) }, 200, { "X-FF-AI-Fallback": "1" });
  }

  // Budget Guard (admin-managed)
  if (budgetGuardEnabled && (maxCallsPerUserDay > 0 || maxCostPerUserDay > 0 || maxCostTotalDay > 0)) {
    try {
      const db = requireDB(env as any);

      // per-user calls today
      const callsRow = await db.prepare("SELECT COUNT(*) as cnt FROM ai_events WHERE user_id = ? AND ts >= ?")
        .bind(String(user.sub), dayStart).first();
      const callsToday = Number(callsRow?.cnt || 0);

      // per-user cost today
      const costUserRow = await db.prepare("SELECT SUM(COALESCE(estimated_cost_usd,0)) as cost FROM ai_events WHERE user_id = ? AND ts >= ?")
        .bind(String(user.sub), dayStart).first();
      const costUserToday = Number(costUserRow?.cost || 0);

      // total cost today
      const costTotalRow = await db.prepare("SELECT SUM(COALESCE(estimated_cost_usd,0)) as cost FROM ai_events WHERE ts >= ?")
        .bind(dayStart).first();
      const costTotalToday = Number(costTotalRow?.cost || 0);

      const exceedCalls = maxCallsPerUserDay > 0 && callsToday >= maxCallsPerUserDay;
      const exceedUserCost = maxCostPerUserDay > 0 && costUserToday >= maxCostPerUserDay;
      const exceedTotalCost = maxCostTotalDay > 0 && costTotalToday >= maxCostTotalDay;

      if (exceedCalls || exceedUserCost || exceedTotalCost) {
        if (onLimitAction === "block") {
          return jsonV({ error: "AI_LIMIT", message: "Достигнут лимит использования AI. Попробуйте позже.", meta: { exceedCalls, exceedUserCost, exceedTotalCost } }, 429);
        }
        // default: fallback
        const profile = await loadUserProfile(env as any, String(user.sub));
        const fallback = buildFallback(feature, profile);
        await logAiEvent(env as any, { userId: String(user.sub), feature, status: 200, latencyMs: 0, safeMode, requestJson: body, responseJson: fallback, error: null, model: "fallback_budget_guard", inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, isFallback: true });
        return jsonV({ ok: true, data: fallback, fallback: true, limited: true, meta: { exceedCalls, exceedUserCost, exceedTotalCost } }, 200);
      }
    } catch {
      // never break product if guard check fails
    }
  }

  const apiKey = (env as any).GEMINI_API_KEY || (env as any).API_KEY || (env as any).GOOGLE_API_KEY;

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 4 * 1024 * 1024) {
    return jsonResponse({ error: { message: "Payload too large" } }, 413);
  }

  // Safe mode: apply conservative limits and settings (toggled via feature_flags.ai_safe_mode)
  if (safeMode) {
    const isPro = Array.isArray(user?.roles) && user.roles.includes('pro');
    const dailyLimit = isPro ? 200 : 50;
    try { await enforceDailyLimit((env as any).DB, String(user.sub), `ai_${feature}`, dailyLimit); }
    catch (e: any) {
      await logAiEvent(env as any, { userId: String(user.sub), feature, status: 429, latencyMs: Date.now()-startedAt, safeMode: true, requestJson: body, error: 'DAILY_LIMIT' });
      return jsonV({ error: 'DAILY_LIMIT', limit: dailyLimit }, 429);
    }
  }
  const kv = env.FITFOCUS_KV;
  const identity = String(user?.sub || "");

  if (kv) {
    const cooldownKey = `rl:cd:4s:${identity}:${feature}`;
    const seen = await kv.get(cooldownKey);
    if (seen) {
      await logUsage(env, { identity, feature, status: 429, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return jsonResponse({ error: { message: "Rate limit exceeded (cooldown)" } }, 429);
    }
    await kv.put(cooldownKey, "1", { expirationTtl: 4 });

    const burstKey = `rl:burst:10m:${identity}:${feature}`;
    const current = Number(await kv.get(burstKey) || "0");
    if (current >= 20) {
      await logUsage(env, { identity, feature, status: 429, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return jsonResponse({ error: { message: "Rate limit exceeded (burst)" } }, 429);
    }
    await kv.put(burstKey, String(current + 1), { expirationTtl: 60 * 10 });

    const day = new Date().toISOString().slice(0, 10);
    const quotaKey = `quota:${day}:${identity}:${feature}`;
    const usedToday = Number(await kv.get(quotaKey) || "0");
    const freeLimit = Number(env.FREE_AI_DAILY_LIMIT || "3");

    if (usedToday >= freeLimit) {
      await logUsage(env, { identity, feature, status: 402, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return jsonResponse({
        error: {
          code: "PAYWALL",
          message: `Guest free limit reached: ${freeLimit}/day. Upgrade to Pro for unlimited AI.`,
          meta: { feature, limitPerDay: freeLimit }
        }
      }, 402, { "X-FF-Quota": "EXCEEDED" });
    }
    await kv.put(quotaKey, String(usedToday + 1), { expirationTtl: 60 * 60 * 24 * 2 });
  }

  const bodyHash = await sha256Hex(bodyText || "{}");
  const dedupKey = `dedup:60s:${feature}:${bodyHash}`;

  if (kv) {
    const cached = await kv.get(dedupKey, { type: "json" }) as any | null;
    if (cached && typeof cached === "object" && cached.data) {
      await logUsage(env, { identity, feature, status: cached.status || 200, latency: Date.now() - startedAt, bytesIn: bodyText.length, cacheHit: true });
      return new Response(JSON.stringify(cached.data), {
        status: cached.status || 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-FF-Cache": "HIT" },
      });
    }
  }

  if (!apiKey) {
    await logUsage(env, { identity, feature, status: 500, latency: Date.now() - startedAt, bytesIn: bodyText.length });
    return jsonResponse({ error: { message: "GEMINI_API_KEY (или API_KEY/GOOGLE_API_KEY) не настроен на сервере." } }, 500);
  }

  const model = body?.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const { feature: _drop, ...payload } = body ?? {};
  const payloadToSend: any = (payload && typeof payload === "object") ? payload : {};

  if ("config" in payloadToSend) {
    if (!("generationConfig" in payloadToSend)) {
      payloadToSend.generationConfig = payloadToSend.config;

  if (safeMode) {
    payloadToSend.generationConfig = payloadToSend.generationConfig || {};
    // Conservative defaults to reduce latency/cost and force structured output
    if (payloadToSend.generationConfig.maxOutputTokens == null) payloadToSend.generationConfig.maxOutputTokens = 900;
    if (payloadToSend.generationConfig.temperature == null) payloadToSend.generationConfig.temperature = 0.4;
    // Encourage JSON-only outputs
    if (payloadToSend.generationConfig.responseMimeType == null) payloadToSend.generationConfig.responseMimeType = 'application/json';
  }
    }
    delete payloadToSend.config;
  }

  if ("contents" in payloadToSend) {
    const normalized = normalizeContents(payloadToSend.contents);
    if (!normalized.length) {
      await logUsage(env, { identity, feature, status: 400, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return jsonResponse({
        error: { message: "Invalid contents: expected string or Content/Content[] with parts[]. Use {contents:[{role:'user',parts:[{text:'...'}]}]}" }
      }, 400);
    }
    payloadToSend.contents = normalized;
  }

  let geminiResp: Response | null = null;
  let data: any = {};
  let latency = 0;

  try {
    geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payloadToSend),
    });

    data = await geminiResp.json().catch(() => ({}));
    latency = Date.now() - startedAt;
  } catch (err: any) {
    latency = Date.now() - startedAt;

    if (fallbackMode) {
      const profile = await loadUserProfile(env as any, String(user.sub));
      const fallback = buildFallback(feature, profile);
      await logAiEvent(env as any, {
        userId: String(user.sub),
        feature,
        status: 200,
        latencyMs: latency,
        safeMode,
        requestJson: body,
        responseJson: fallback,
        error: (err && (err.message || String(err))) || "fetch_failed",
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

    await logAiEvent(env as any, { userId: String(user.sub), feature, status: 500, latencyMs: latency, safeMode, requestJson: body, responseJson: null, error: (err && (err.message || String(err))) || "fetch_failed" });
    return jsonResponse({ error: { message: "AI request failed" } }, 500);
  }


  // --- Compatibility layer -------------------------------------------------
  // UI (geminiService.ts) historically ожидает поле `text`.
  // Gemini API обычно возвращает: candidates[].content.parts[].text
  const extractedText = extractTextFromGemini(data);
  // Fallback on quota/5xx: return a deterministic plan instead of breaking the product.
  if (fallbackMode && shouldFallback(geminiResp!.status)) {
    const profile = await loadUserProfile(env as any, String(user.sub));
    const fallback = buildFallback(feature, profile);
    await logAiEvent(env as any, {
      userId: String(user.sub),
      feature,
      status: 200,
      latencyMs: latency,
      safeMode,
      requestJson: body,
      responseJson: fallback,
      error: data?.error?.message || data?.error || `status_${geminiResp!.status}`,
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


  if (kv) {
    await kv.put(dedupKey, JSON.stringify({ status: geminiResp.status, data }), { expirationTtl: 60 });
    await logUsage(env, { identity, feature, status: geminiResp.status, latency, bytesIn: bodyText.length });
  }

  
  const usage = getGeminiUsage(data);
  await logAiEvent(env as any, {
    userId: String(user.sub),
    feature,
    status: geminiResp.status,
    latencyMs: latency,
    safeMode,
    requestJson: body,
    responseJson: { text: extractedText },
    error: geminiResp.status >= 400 ? (data?.error?.message || data?.error || null) : null,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: estimateCostUsd(usage.inputTokens, usage.outputTokens, inputCostPerMillion, outputCostPerMillion),
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

function extractTextFromGemini(data: any): string {
  if (data && typeof data.text === 'string') return data.text;

  const parts: string[] = [];
  const candidates = data?.candidates;
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const p = c?.content?.parts;
      if (Array.isArray(p)) {
        for (const part of p) {
          if (part && typeof part.text === 'string') parts.push(part.text);
        }
      }
    }
  }

  if (!parts.length && typeof data?.output_text === 'string') return data.output_text;
  return parts.join('\n').trim();
}


// --- Fallback layer ---------------------------------------------------------
// Когда Gemini недоступен/квота/ошибка, продукт не должен "умирать".
// В fallback режиме возвращаем упрощённый, но полезный результат на основе профиля.
async function loadUserProfile(env: any, userId: string): Promise<any> {
  try {
    const row = await env?.DB?.prepare(
      "SELECT profile_json FROM user_profiles WHERE user_id = ?"
    ).bind(userId).first();
    if (!row?.profile_json) return {};
    return JSON.parse(row.profile_json);
  } catch {
    return {};
  }
}

function calcTargetCalories(profile: any): number {
  // Очень грубая оценка: если есть цель и активность — подстраиваем.
  // Это fallback, не медицинская рекомендация.
  const weight = Number(profile?.weight_kg || profile?.weightKg || 70);
  const base = Math.round(weight * 30); // ~ поддержание
  const goal = String(profile?.goal || profile?.goalType || "loss");
  const activity = String(profile?.activity_level || profile?.activityLevel || "medium");
  let adj = 0;
  if (goal === "loss") adj -= 350;
  else if (goal === "gain") adj += 250;
  if (activity === "low") adj -= 150;
  else if (activity === "high") adj += 150;
  const cals = Math.max(1200, base + adj);
  return cals;
}

function buildFallbackWeeklyMenu(profile: any) {
  const target = calcTargetCalories(profile);
  const perMeal = Math.round(target / 3);
  const days = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
  ].map((day) => ({
    day,
    targetCalories: target,
    meals: [
      { name: "Завтрак", calories: perMeal, idea: "Овсянка + йогурт/творог + ягоды" },
      { name: "Обед", calories: perMeal, idea: "Курица/рыба + крупа + овощной салат" },
      { name: "Ужин", calories: perMeal, idea: "Омлет/творог/рыба + овощи" },
    ],
  }));

  return {
    fallback: true,
    reason: "AI temporarily unavailable",
    targetCalories: target,
    days,
    notes: [
      "Это временный план (fallback), чтобы приложение работало без перебоев.",
      "При восстановлении AI вы сможете сгенерировать более точное меню.",
    ],
  };
}

function buildFallbackAdvice(profile: any) {
  const target = calcTargetCalories(profile);
  const w = profile?.weight_kg || profile?.weightKg;
  const tw = profile?.target_weight_kg || profile?.targetWeightKg;
  const act = profile?.activity_level || profile?.activityLevel;
  return {
    fallback: true,
    reason: "AI temporarily unavailable",
    agreement: 0.88,
    experts: [
      { name: "Диетолог", summary: [`Цель: ~${target} ккал/день`, "Белок в каждом приёме пищи", "Овощи 400–600 г/день"] },
      { name: "Тренер", summary: ["3–4 тренировки/нед (или 8–10k шагов/день)", "Прогрессия нагрузки", "Разминка/заминка"] },
      { name: "Психолог", summary: ["Планируй 1–2 " + "любимые" + " еды в неделю без чувства вины", "Сон 7–8 часов", "Фиксируй триггеры переедания"] },
      { name: "Стратег", summary: ["Держи дефицит умеренным", "Следи за средним весом по неделе", "Одна привычка за раз"] },
    ],
    plan: {
      profileSnapshot: { weight: w ?? null, targetWeight: tw ?? null, activity: act ?? null },
      steps: [
        "Собери тарелку: 1/2 овощи, 1/4 белок, 1/4 сложные углеводы.",
        "Пей воду и добавь лёгкую активность каждый день.",
        "Отслеживай питание 3 дня для калибровки.",
      ],
    },
  };
}

function buildFallback(feature: string, profile: any) {
  if (feature === "weekly_menu" || feature === "menu_week" || feature === "weekly_plan") {
    return buildFallbackWeeklyMenu(profile);
  }
  return buildFallbackAdvice(profile);
}

function shouldFallback(status: number): boolean {
  // 429 (quota), 5xx (server), 0/NaN
  if (!status || Number.isNaN(status)) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}
