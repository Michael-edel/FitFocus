// Cloudflare Pages Function: /api/me
// Returns current session user from ff_session cookie (HS256 JWT).

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = readCookie(request.headers.get("Cookie") || "", "ff_session");
  if (!token) return json({ user: null }, 200);

  if (!env.AUTH_JWT_SECRET) return json({ user: null }, 200);

  const payload = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
  if (!payload) return json({ user: null }, 200);

  const user = {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };

  return json({ user }, 200);
};

type Env = { AUTH_JWT_SECRET: string };

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function readCookie(cookieHeader: string, name: string): string | null {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return p.slice(name.length + 1);
  }
  return null;
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacVerify(data: string, signatureB64Url: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, b64urlToBytes(signatureB64Url), new TextEncoder().encode(data));
}

function parseJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const jsonStr = new TextDecoder().decode(b64urlToBytes(parts[1]));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function verifySessionJwt(token: string, secret: string): Promise<any | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const data = `${h}.${p}`;
  const ok = await hmacVerify(data, sig, secret);
  if (!ok) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;
  return payload;
}
