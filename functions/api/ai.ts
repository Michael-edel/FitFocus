
/**
 * FITFOCUS v18_USER_LIMITS
 * AI limits now scoped to:
 *   - userId (if authenticated via ff_session)
 *   - fallback to ipHash (guest mode)
 */

import { jwtVerify } from "jose";

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

function getCookie(req: Request, name: string) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(^|;\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

async function resolveIdentity(request: Request, env: Env): Promise<string> {
  const token = getCookie(request, "ff_session");

  if (token && env.AUTH_JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(env.AUTH_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      const uid = (payload as any)?.uid;
      if (uid) return `user:${uid}`;
    } catch {
      // ignore invalid token → fallback to IP
    }
  }

  const ipRaw = request.headers.get("CF-Connecting-IP") || "unknown";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env.IP_HASH_SALT || "ff")+":"+ipRaw));
  const ipHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  return `ip:${ipHash}`;
}

function normalizeContents(input: any): GeminiContent[] {
  if (typeof input === "string") {
    return [{ role: "user", parts: [{ text: input }] }];
  }
  if (Array.isArray(input)) return input;
  if (input?.parts) return [input];
  return [];
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), { status: 500 });

  const body = await request.json().catch(() => ({}));
  const feature = body?.feature || "ai";

  const identity = await resolveIdentity(request, env);
  const kv = env.FITFOCUS_KV;

  if (kv) {
    const day = new Date().toISOString().slice(0,10);
    const quotaKey = `quota:${day}:${identity}:${feature}`;
    const used = Number(await kv.get(quotaKey) || "0");
    const limit = Number(env.FREE_AI_DAILY_LIMIT || "3");

    if (used >= limit) {
      return new Response(JSON.stringify({
        error: {
          code: "PAYWALL",
          message: `Free limit reached (${limit}/day)`
        }
      }), { status: 402 });
    }

    await kv.put(quotaKey, String(used+1), { expirationTtl: 60*60*24*2 });
  }

  const { feature: _drop, config, ...payload } = body;
  const payloadToSend: any = payload;

  if (config && !payloadToSend.generationConfig) {
    payloadToSend.generationConfig = config;
  }

  if ("contents" in payloadToSend) {
    payloadToSend.contents = normalizeContents(payloadToSend.contents);
  }

  const model = body?.model || "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const geminiResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadToSend)
  });

  const data = await geminiResp.text();

  return new Response(data, {
    status: geminiResp.status,
    headers: { "Content-Type": "application/json" }
  });
}
