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

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function verifyState(
  state: string,
  secret: string,
  opts: { expectedNonce?: string | null; nowMs?: number; maxAgeMs?: number } = {},
): Promise<any | null> {
  if (!state.includes(".")) return null;
  const [stateB64, stateSig] = state.split(".");
  const rawState = new TextDecoder().decode(b64urlDecodeToBytes(stateB64));
  const expected = await signState(rawState, secret);
  if (expected !== stateSig) return null;
  try {
    const parsed = JSON.parse(rawState);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const issuedAt = Number((parsed as any).t || 0);
    const now = Number(opts.nowMs ?? Date.now());
    const maxAgeMs = Number(opts.maxAgeMs ?? OAUTH_STATE_TTL_MS);
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
    if (issuedAt > now + 60_000) return null;
    if (now - issuedAt > maxAgeMs) return null;
    const expectedNonce = opts.expectedNonce ? String(opts.expectedNonce) : "";
    if (expectedNonce && String((parsed as any).n || "") !== expectedNonce) return null;
    return parsed;
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

type JwtParts = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array;
};

type AppleJwk = {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
};

type AppleKeysResponse = { keys?: AppleJwk[] };

let appleJwksCache: { keys: AppleJwk[]; expiresAt: number } | null = null;

function parseJwtParts(token: string): JwtParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [headerPart, payloadPart, signaturePart] = parts;
    const headerJson = new TextDecoder().decode(b64urlDecodeToBytes(headerPart));
    const payloadJson = new TextDecoder().decode(b64urlDecodeToBytes(payloadPart));
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);
    if (!header || typeof header !== "object" || Array.isArray(header)) return null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return {
      header: header as Record<string, unknown>,
      payload: payload as Record<string, unknown>,
      signingInput: `${headerPart}.${payloadPart}`,
      signature: b64urlDecodeToBytes(signaturePart),
    };
  } catch {
    return null;
  }
}

async function loadAppleJwks(): Promise<AppleJwk[]> {
  const now = Date.now();
  if (appleJwksCache && appleJwksCache.expiresAt > now && appleJwksCache.keys.length > 0) {
    return appleJwksCache.keys;
  }

  const response = await fetch("https://appleid.apple.com/auth/keys", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`APPLE_JWKS_FETCH_FAILED:${response.status}`);
  }

  const payload = (await safeResponseJson(response)) as AppleKeysResponse;
  const keys = Array.isArray(payload?.keys) ? payload.keys.filter((key) => key?.kty === "RSA" && !!key?.kid) : [];
  if (!keys.length) {
    throw new Error("APPLE_JWKS_EMPTY");
  }

  appleJwksCache = {
    keys,
    expiresAt: now + 60 * 60 * 1000,
  };
  return keys;
}

async function safeResponseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

async function importAppleJwk(jwk: AppleJwk): Promise<CryptoKey> {
  return (crypto.subtle.importKey as any)(
    "jwk",
    {
      kty: jwk.kty,
      kid: jwk.kid,
      use: jwk.use,
      alg: "RS256",
      n: jwk.n,
      e: jwk.e,
      ext: true,
    },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  ) as Promise<CryptoKey>;
}

export async function verifyAppleIdToken(token: string, expectedAudience: string): Promise<Record<string, unknown> | null> {
  const parsed = parseJwtParts(token);
  if (!parsed) return null;

  const alg = String(parsed.header.alg || "");
  const kid = String(parsed.header.kid || "");
  if (alg !== "RS256" || !kid) return null;

  const jwks = await loadAppleJwks();
  const jwk = jwks.find((item) => item.kid === kid);
  if (!jwk) return null;

  const key = await importAppleJwk(jwk);
  const signature = new Uint8Array(parsed.signature);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(parsed.signingInput),
  );
  if (!verified) return null;

  const payload = parsed.payload;
  const now = Math.floor(Date.now() / 1000);
  if (String(payload.iss || "") !== "https://appleid.apple.com") return null;
  if (String(payload.aud || "") !== expectedAudience) return null;
  if (Number(payload.exp || 0) <= now) return null;
  if (!String(payload.sub || "")) return null;
  return payload;
}
