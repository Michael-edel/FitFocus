
/**
 * FitFocus: Google Sign-In (GIS) → tokeninfo verification → app session cookie (HS256)
 *
 * POST /api/auth/google
 * Body: { credential: string }  // Google ID token from GIS
 *
 * Env vars required (Cloudflare Pages):
 *  - GOOGLE_CLIENT_ID : OAuth 2.0 Client ID (Web)
 *  - AUTH_JWT_SECRET  : random long secret used to sign app session (HS256)
 *
 * Optional:
 *  - FITFOCUS_KV      : KV binding for persisting users (recommended)
 *
 * Note: This version avoids external deps (no "jose") to keep Pages Functions bundler happy.
 *       It verifies ID tokens via Google's tokeninfo endpoint.
 */

export interface Env {
  GOOGLE_CLIENT_ID: string;
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

function cookie(name: string, value: string, opts: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax"|"Strict"|"None"; path?: string } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.GOOGLE_CLIENT_ID) return jsonResponse({ error: { message: "Missing GOOGLE_CLIENT_ID in env" } }, 500);
  if (!env.AUTH_JWT_SECRET) return jsonResponse({ error: { message: "Missing AUTH_JWT_SECRET in env" } }, 500);

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: { message: "Invalid JSON body" } }, 400);
  }

  const idToken = body?.credential;
  if (typeof idToken !== "string" || idToken.length < 50) {
    return jsonResponse({ error: { message: "Missing credential (Google ID token)" } }, 400);
  }

  const tokeninfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const tiResp = await fetch(tokeninfoUrl, { method: "GET" });
  const ti = await tiResp.json().catch(() => ({}));

  if (!tiResp.ok) {
    return jsonResponse({ error: { message: "Invalid Google token", details: ti } }, 401);
  }

  if (ti.aud !== env.GOOGLE_CLIENT_ID) {
    return jsonResponse({ error: { message: "Google token aud mismatch" } }, 401);
  }

  const exp = Number(ti.exp || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!exp || exp < now) {
    return jsonResponse({ error: { message: "Google token expired" } }, 401);
  }

  const sub = String(ti.sub || "");
  if (!sub) return jsonResponse({ error: { message: "Invalid Google token: no sub" } }, 401);

  const user: any = {
    id: `google:${sub}`,
    provider: "google",
    sub,
    email: ti.email || null,
    emailVerified: ti.email_verified === "true" || ti.email_verified === true,
    name: ti.name || null,
    picture: ti.picture || null,
    givenName: ti.given_name || null,
    familyName: ti.family_name || null,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };

  if (env.FITFOCUS_KV) {
    const key = `user:${user.id}`;
    const prev = await env.FITFOCUS_KV.get(key, { type: "json" }) as any | null;
    if (prev && typeof prev === "object") {
      user.createdAt = prev.createdAt ?? user.createdAt;
    }
    await env.FITFOCUS_KV.put(key, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 365 });
  }

  const sessionJwt = await signSessionJwt({
    uid: user.id,
    email: user.email,
    name: user.name,
    pic: user.picture,
    prov: "google",
  }, env.AUTH_JWT_SECRET, 60 * 60 * 24 * 30);

  const isHttps = (new URL(request.url)).protocol === "https:";
  return jsonResponse({ ok: true, user }, 200, {
    "Set-Cookie": cookie("ff_session", sessionJwt, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      secure: isHttps,
      sameSite: "Lax",
      path: "/",
    }),
  });
}
