import { requireUser } from "./_lib/auth";
import { ensureUserRow, requireDB } from "./_lib/db";

/**
 * FITFOCUS v18_USER_LIMITS_NO_JOSE
 * - Limits scoped to authenticated userId (ff_session) with IP fallback
 * - Rate limit + daily limit + dedup cache (KV)
 * - Normalizes contents for Gemini
 * - Maps client 'config' -> Gemini 'generationConfig'
 * - No external deps.
 */

export interface Env {
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

function buildProfileContext(p: any): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.name) parts.push(`Имя: ${p.name}`);
  if (p.gender) parts.push(`Пол: ${p.gender}`);
  if (p.age) parts.push(`Возраст: ${p.age}`);
  if (p.height) parts.push(`Рост: ${p.height} см`);
  if (p.weight) parts.push(`Вес: ${p.weight} кг`);
  if (p.target_weight) parts.push(`Целевой вес: ${p.target_weight} кг`);
  if (p.activity_level) parts.push(`Уровень активности: ${p.activity_level}`);
  if (p.goal) parts.push(`Цель: ${p.goal}`);
  if (p.loss_deficit != null) parts.push(`Дефицит: ${p.loss_deficit} ккал/день`);
  if (p.gain_surplus != null) parts.push(`Профицит: ${p.gain_surplus} ккал/день`);
  if (p.exclusions) parts.push(`Исключения/аллергены: ${p.exclusions}`);
  if (!parts.length) return "";
  return `ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (используй для персонализации):\n${parts.join("\n")}\n---\n`;
}

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
  const apiKey = (env as any).GEMINI_API_KEY || (env as any).API_KEY || (env as any).GOOGLE_API_KEY;

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 4 * 1024 * 1024) {
    return jsonResponse({ error: { message: "Payload too large" } }, 413);
  }

  let bodyText = "";
  let body: any = null;
  try {
    bodyText = await request.text();
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return jsonResponse({ error: { message: "Invalid JSON body" } }, 400);
  }

  const feature = (typeof body?.feature === "string" && body.feature.trim()) ? body.feature.trim() : "ai";
  const kv = env.FITFOCUS_KV;
  const identity = await resolveIdentityKey(request, env);
  // Premium: load user profile from D1 (server-side source of truth for AI personalization)
  let profileContext = "";
  try {
    if ((env as any).DB && (env as any).AUTH_JWT_SECRET) {
      const sessionUser = await requireUser(request, env as any);
      const db = requireDB(env as any);
      await ensureUserRow(db, sessionUser);
      const profileRow = await db
        .prepare(
          `SELECT name, gender, age, height, weight, target_weight, activity_level, goal, exclusions, loss_deficit, gain_surplus
           FROM user_profiles WHERE user_id = ?`
        )
        .bind(sessionUser.sub)
        .first();
      profileContext = buildProfileContext(profileRow);
    }
  } catch {
    // ignore: AI can still work without profile
  }


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
    
    // Inject profile context into the first user message for key premium features.
    if (profileContext && ["weekly_menu", "personal_plan", "coach_advice", "ai_council", "meal_analyze", "family_weekly_menu"].includes(feature)) {
      if (normalized.length && (normalized[0] as any).role === "user") {
        const first = normalized[0] as any;
        if (first.parts?.length && first.parts[0]?.text) {
          first.parts[0].text = profileContext + String(first.parts[0].text);
        } else {
          first.parts = [{ text: profileContext }, ...(first.parts || [])];
        }
      } else {
        normalized.unshift({ role: "user", parts: [{ text: profileContext }] } as any);
      }
    }
payloadToSend.contents = normalized;
  }

  const geminiResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payloadToSend),
  });

  const data = await geminiResp.json().catch(() => ({}));
  const latency = Date.now() - startedAt;

  // --- Compatibility layer -------------------------------------------------
  // UI (geminiService.ts) historically ожидает поле `text`.
  // Gemini API обычно возвращает: candidates[].content.parts[].text
  const extractedText = extractTextFromGemini(data);

  if (kv) {
    await kv.put(dedupKey, JSON.stringify({ status: geminiResp.status, data }), { expirationTtl: 60 });
    await logUsage(env, { identity, feature, status: geminiResp.status, latency, bytesIn: bodyText.length });
  }

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
