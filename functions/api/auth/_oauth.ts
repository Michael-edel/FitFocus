export function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function getBaseUrl(request: Request): string {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

export function normalizeAppUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export async function signState(raw: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  return base64UrlEncode(new Uint8Array(sig));
}

export async function verifyState(state: string, secret: string): Promise<any | null> {
  if (!state.includes(".")) return null;
  const [stateB64, stateSig] = state.split(".");
  const rawState = new TextDecoder().decode(b64urlDecodeToBytes(stateB64));
  const expected = await signState(rawState, secret);
  if (expected !== stateSig) return null;
  try {
    return JSON.parse(rawState);
  } catch {
    return null;
  }
}

export function cookieSerialize(
  name: string,
  value: string,
  opts: { httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; path?: string; maxAge?: number } = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

async function importPkcs8Key(pem: string): Promise<CryptoKey> {
  const der = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(der);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey("pkcs8", bytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

function derToJose(signatureDer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(signatureDer);
  if (bytes[0] !== 0x30) throw new Error("Invalid ECDSA signature");
  let offset = 2;
  if (bytes[offset] !== 0x02) throw new Error("Invalid ECDSA signature");
  const rLen = bytes[offset + 1];
  let r = bytes.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (bytes[offset] !== 0x02) throw new Error("Invalid ECDSA signature");
  const sLen = bytes[offset + 1];
  let s = bytes.slice(offset + 2, offset + 2 + sLen);

  while (r.length > 0 && r[0] === 0) r = r.slice(1);
  while (s.length > 0 && s[0] === 0) s = s.slice(1);

  const out = new Uint8Array(64);
  out.set(r.slice(-32), 32 - Math.min(32, r.length));
  out.set(s.slice(-32), 64 - Math.min(32, s.length));
  return out;
}

async function signEs256Jwt(header: Record<string, any>, payload: Record<string, any>, privateKeyPem: string): Promise<string> {
  const enc = new TextEncoder();
  const part1 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const part2 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${part1}.${part2}`;
  const key = await importPkcs8Key(privateKeyPem);
  const sigDer = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput));
  const sig = base64UrlEncode(derToJose(sigDer));
  return `${signingInput}.${sig}`;
}

export async function signSessionJwt(payload: Record<string, any>, secret: string, ttlSeconds: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, exp: now + ttlSeconds };
  const enc = new TextEncoder();
  const part1 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const part2 = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)));
  const signingInput = `${part1}.${part2}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

export async function createAppleClientSecret(env: {
  APPLE_CLIENT_SECRET?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_PRIVATE_KEY?: string;
}): Promise<string> {
  const provided = String(env.APPLE_CLIENT_SECRET || "").trim();
  if (provided) return provided;

  const teamId = String(env.APPLE_TEAM_ID || "").trim();
  const keyId = String(env.APPLE_KEY_ID || "").trim();
  const clientId = String(env.APPLE_CLIENT_ID || "").trim();
  const privateKey = String(env.APPLE_PRIVATE_KEY || "").trim();
  if (!teamId || !keyId || !clientId || !privateKey) {
    throw new Error("Missing APPLE_CLIENT_SECRET or APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_CLIENT_ID/APPLE_PRIVATE_KEY");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 180,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  return signEs256Jwt(header, payload, privateKey);
}

export function decodeJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const jsonStr = new TextDecoder().decode(b64urlDecodeToBytes(parts[1]));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}
