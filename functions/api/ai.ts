/**
 * FITFOCUS v17_SAFE — Free plan with AI limits (no D1 required)
 * + Hotfix: normalize Gemini payload (contents/config) to avoid 400 Bad Request
 *
 * Cloudflare Pages → Bindings:
 * - KV: FITFOCUS_KV (optional)
 * Env Secrets:
 * - GEMINI_API_KEY (required)
 * - IP_HASH_SALT (optional but recommended)
 */

export interface Env {
  GEMINI_API_KEY: string;
  FITFOCUS_KV?: any;
  IP_HASH_SALT?: string;
  FREE_AI_DAILY_LIMIT?: string;
}

type JsonObj = Record<string, any>;

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const startedAt = Date.now();

  const apiKey = (env as any).GEMINI_API_KEY || (env as any).API_KEY || (env as any).GOOGLE_API_KEY;

  const json = (obj: any, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    });

  const sha256Hex = async (input: string) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const ipRaw = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256Hex(`${env.IP_HASH_SALT || "ff"}:${ipRaw}`);

  // ---- Payload size limit (4MB) ----
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 4 * 1024 * 1024) {
    return json({ error: { message: "Payload too large" } }, 413);
  }

  let bodyText = "";
  let body: any = null;

  try {
    bodyText = await request.text();
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }

  const feature = (typeof body?.feature === "string" && body.feature.trim()) ? body.feature.trim() : "ai";

  // ---- KV Optional Handlers ----
  const kv = env.FITFOCUS_KV;

  if (kv) {
    // ---- RATE LIMIT (cooldown) ----
    const cooldownKey = `rl:cd:4s:${ipHash}:${feature}`;
    const seen = await kv.get(cooldownKey);
    if (seen) {
      await logUsage(env, { ipHash, feature, status: 429, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return json({ error: { message: "Rate limit exceeded (cooldown)" } }, 429);
    }
    await kv.put(cooldownKey, "1", { expirationTtl: 4 });

    // ---- RATE LIMIT (burst) ----
    const burstKey = `rl:burst:10m:${ipHash}:${feature}`;
    const current = Number(await kv.get(burstKey) || "0");
    if (current >= 20) {
      await logUsage(env, { ipHash, feature, status: 429, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return json({ error: { message: "Rate limit exceeded (burst)" } }, 429);
    }
    await kv.put(burstKey, String(current + 1), { expirationTtl: 60 * 10 });

    // ---- DAILY QUOTA ----
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const quotaKey = `quota:${day}:${ipHash}:${feature}`;
    const usedToday = Number(await kv.get(quotaKey) || "0");
    const freeLimit = Number(env.FREE_AI_DAILY_LIMIT || "3");

    if (usedToday >= freeLimit) {
      await logUsage(env, { ipHash, feature, status: 402, latency: Date.now() - startedAt, bytesIn: bodyText.length });
      return json(
        {
          error: {
            code: "PAYWALL",
            message: `Free limit reached: ${freeLimit}/day. Upgrade to Pro for unlimited AI.`,
            meta: { feature, limitPerDay: freeLimit },
          },
        },
        402,
        { "X-FF-Quota": "EXCEEDED" }
      );
    }
    await kv.put(quotaKey, String(usedToday + 1), { expirationTtl: 60 * 60 * 24 * 2 });
  }

  // ---- DEDUP CACHE (60s) ----
  const bodyHash = await sha256Hex(bodyText || "{}");
  const dedupKey = `dedup:60s:${feature}:${bodyHash}`;

  if (kv) {
    const cached = (await kv.get(dedupKey, { type: "json" })) as any | null;
    if (cached && typeof cached === "object" && cached.data) {
      await logUsage(env, {
        ipHash,
        feature,
        status: cached.status || 200,
        latency: Date.now() - startedAt,
        bytesIn: bodyText.length,
        cacheHit: true,
      });
      return new Response(JSON.stringify(cached.data), {
        status: cached.status || 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-FF-Cache": "HIT" },
      });
    }
  }

  // ---- GEMINI ----
  if (!apiKey) {
    await logUsage(env, { ipHash, feature, status: 500, latency: Date.now() - startedAt, bytesIn: bodyText.length });
    return json({ error: { message: "GEMINI_API_KEY (или API_KEY/GOOGLE_API_KEY) не настроен на сервере." } }, 500);
  }

  const model = body?.model || "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  // Drop "feature" and normalize payload to Gemini format
  const { feature: _drop, ...rawPayload } = (body ?? {}) as JsonObj;
  const payloadToSend = normalizeGeminiPayload(rawPayload);

  const geminiResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadToSend),
  });

  const latency = Date.now() - startedAt;

  // IMPORTANT: return readable error details (not [object Object])
  const respText = await geminiResp.text();
  let data: any = null;
  try {
    data = respText ? JSON.parse(respText) : {};
  } catch {
    data = { raw: respText };
  }

  // Save dedup cache + usage
  if (kv) {
    await kv.put(dedupKey, JSON.stringify({ status: geminiResp.status, data }), { expirationTtl: 60 });
    await logUsage(env, { ipHash, feature, status: geminiResp.status, latency, bytesIn: bodyText.length });
  }

  return new Response(JSON.stringify(data), {
    status: geminiResp.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-FF-Cache": "MISS",
      "X-FF-KV": kv ? "found" : "missing",
    },
  });
}

/**
 * Normalizes payload from frontend into Gemini REST format:
 * - config -> generationConfig
 * - contents (object) -> contents (array)
 * - ensure each content has role + parts
 */
function normalizeGeminiPayload(input: JsonObj): JsonObj {
  const p: JsonObj = { ...(input || {}) };

  // Some clients send "config" but Gemini expects "generationConfig"
  if (p.config && !p.generationConfig) {
    p.generationConfig = p.config;
    delete p.config;
  }

  // Normalize contents:
  // allowed:
  //  - contents: [{ role, parts: [...] }, ...]
  //  - contents: { parts: [...] }   (legacy) -> wrap into array + role:user
  const c = p.contents;

  if (c && !Array.isArray(c) && typeof c === "object") {
    // If it's like {parts:[...]} or {role?, parts?...}
    const role = typeof c.role === "string" ? c.role : "user";
    const parts = Array.isArray(c.parts) ? c.parts : [];
    p.contents = [{ role, parts }];
  } else if (Array.isArray(c)) {
    p.contents = c.map((item: any) => {
      if (!item || typeof item !== "object") return { role: "user", parts: [] };
      const role = typeof item.role === "string" ? item.role : "user";
      const parts = Array.isArray(item.parts) ? item.parts : [];
      return { ...item, role, parts };
    });
  }

  // If still no contents, but there is "prompt" or "text" fields (failsafe)
  if (!p.contents) {
    const text = typeof p.text === "string" ? p.text : (typeof p.prompt === "string" ? p.prompt : "");
    if (text) {
      p.contents = [{ role: "user", parts: [{ text }] }];
      delete p.prompt;
      delete p.text;
    }
  }

  return p;
}

async function logUsage(
  env: Env,
  ev: { ipHash: string; feature: string; status: number; latency: number; bytesIn: number; cacheHit?: boolean }
) {
  if (!env.FITFOCUS_KV) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = `usage:${day}:${ev.ipHash}:${ev.feature}`;

    const prevRaw = await env.FITFOCUS_KV.get(key);
    const prev = prevRaw
      ? JSON.parse(prevRaw)
      : { count: 0, errorCount: 0, totalLatency: 0, totalBytesIn: 0, cacheHits: 0, lastStatus: 0, lastTs: 0 };

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
