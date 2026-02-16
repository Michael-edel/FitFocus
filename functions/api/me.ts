
/**
 * FitFocus: current user (session)
 * GET /api/me
 * Reads ff_session cookie (HS256 JWT signed with AUTH_JWT_SECRET)
 * No external deps.
 */

export interface Env {
  AUTH_JWT_SECRET: string;
  FITFOCUS_KV?: any;
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

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.AUTH_JWT_SECRET) return jsonResponse({ user: null, error: { message: "Missing AUTH_JWT_SECRET" } }, 500);

  const token = getCookie(request, "ff_session");
  if (!token) return jsonResponse({ user: null }, 200);

  const payload = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
  if (!payload) return jsonResponse({ user: null }, 200);

  const uid = payload?.uid as string | undefined;

  if (uid && env.FITFOCUS_KV) {
    const full = await env.FITFOCUS_KV.get(`user:${uid}`, { type: "json" }) as any | null;
    if (full) return jsonResponse({ user: full }, 200);
  }

  return jsonResponse({
    user: {
      id: uid ?? null,
      provider: payload?.prov ?? null,
      email: payload?.email ?? null,
      name: payload?.name ?? null,
      picture: payload?.pic ?? null,
    }
  }, 200);
}
