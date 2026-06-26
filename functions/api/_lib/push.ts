import { nowMs, uuid } from "./db";

export type PushEnv = {
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  content_encoding: string | null;
  device_label: string | null;
  user_agent: string | null;
  created_at: number;
  updated_at: number;
  last_sent_at: number | null;
  last_error: string | null;
  enabled: number;
};

export type PushSubscriptionPayload = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function getDeviceLabelFallback(userAgent?: string | null) {
  const ua = userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Устройство";
}

export function normalizePushDeviceLabel(label?: string | null, userAgent?: string | null) {
  const trimmed = String(label || "").trim();
  if (trimmed) return trimmed.slice(0, 120);
  return getDeviceLabelFallback(userAgent).slice(0, 120);
}

function getBrowserLabelFallback(userAgent?: string | null, browserHint?: string | null) {
  const ua = `${browserHint || ""} ${userAgent || ""}`;
  if (/YaBrowser/i.test(ua) || /Yandex/i.test(ua)) return "Yandex";
  if (/Comet/i.test(ua)) return "Comet";
  if (/Edg/i.test(ua)) return "Edge";
  if (/OPR/i.test(ua) || /Opera/i.test(ua)) return "Opera";
  if (/Brave/i.test(ua)) return "Brave";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/CriOS/i.test(ua) || /Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "Браузер";
}

export function normalizePushBrowserLabel(userAgent?: string | null, browserHint?: string | null) {
  return getBrowserLabelFallback(userAgent, browserHint).slice(0, 120);
}

export function parsePushSubscription(payload: PushSubscriptionPayload | null | undefined) {
  const endpoint = String(payload?.endpoint || "").trim();
  const p256dh = String(payload?.keys?.p256dh || "").trim();
  const auth = String(payload?.keys?.auth || "").trim();
  const contentEncoding = "aes128gcm";
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth, contentEncoding };
}

export function hasPushConfig(env: PushEnv): boolean {
  return Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && env.PUSH_VAPID_SUBJECT);
}

export function getPushConfigError(env: PushEnv): string | null {
  if (hasPushConfig(env)) return null;
  return "PUSH_CONFIG";
}

const PUSH_TTL_SECONDS = 60 * 60 * 24 * 7;
const PUSH_RECORD_SIZE = 4096;
const PUSH_AES_TAG_BYTES = 16;
const PUSH_KEY_INFO = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
const PUSH_NONCE_INFO = new TextEncoder().encode("Content-Encoding: nonce\0");

type Bytes = Uint8Array<ArrayBuffer>;

function base64UrlToBytes(value: string): Bytes {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8(value: string): Bytes {
  return new TextEncoder().encode(value);
}

function concatBytes(parts: Uint8Array[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function copyBytes(bytes: Uint8Array, length = bytes.length): Bytes {
  const out = new Uint8Array(length);
  out.set(bytes.subarray(0, length));
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Bytes> {
  const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, toArrayBuffer(data)));
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Bytes> {
  return hmacSha256(salt, ikm);
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Bytes> {
  const chunks: Bytes[] = [];
  let previous: Bytes = new Uint8Array(0);
  let produced = 0;
  let counter = 1;
  while (produced < length) {
    previous = await hmacSha256(prk, concatBytes([previous, info, new Uint8Array([counter])]));
    chunks.push(previous);
    produced += previous.length;
    counter += 1;
  }
  return copyBytes(concatBytes(chunks), length);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Bytes> {
  return hkdfExpand(await hkdfExtract(salt, ikm), info, length);
}

function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function encodeJwtPart(value: unknown): string {
  return bytesToBase64Url(utf8(JSON.stringify(value)));
}

async function buildVapidAuthorization(endpoint: string, env: PushEnv): Promise<string> {
  const publicKey = base64UrlToBytes(env.PUSH_VAPID_PUBLIC_KEY!);
  const privateKey = base64UrlToBytes(env.PUSH_VAPID_PRIVATE_KEY!);
  if (publicKey.length !== 65) throw new Error("PUSH_VAPID_PUBLIC_KEY_LENGTH");
  if (privateKey.length !== 32) throw new Error("PUSH_VAPID_PRIVATE_KEY_LENGTH");

  const audience = new URL(endpoint).origin;
  const jwtHeader = encodeJwtPart({ typ: "JWT", alg: "ES256" });
  const jwtPayload = encodeJwtPart({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.PUSH_VAPID_SUBJECT!,
  });
  const signingInput = `${jwtHeader}.${jwtPayload}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(publicKey.slice(1, 33)),
      y: bytesToBase64Url(publicKey.slice(33, 65)),
      d: bytesToBase64Url(privateKey),
      ext: false,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, toArrayBuffer(utf8(signingInput))));
  return `vapid t=${signingInput}.${bytesToBase64Url(signature)}, k=${env.PUSH_VAPID_PUBLIC_KEY}`;
}

function xorNonce(base: Uint8Array, counter: number): Bytes {
  const nonce = new Uint8Array(base);
  let n = BigInt(counter);
  for (let i = nonce.length - 1; i >= nonce.length - 6; i -= 1) {
    nonce[i] ^= Number(n & 0xffn);
    n >>= 8n;
  }
  return nonce;
}

async function encryptRecord(key: CryptoKey, nonce: Uint8Array, counter: number, data: Uint8Array, last: boolean): Promise<Bytes> {
  const plain = concatBytes([data, new Uint8Array([last ? 2 : 1])]);
  return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(xorNonce(nonce, counter)), tagLength: 128 }, key, toArrayBuffer(plain)));
}

async function encryptPushPayload(
  subscription: Pick<PushSubscriptionRow, "p256dh" | "auth">,
  payload: Record<string, unknown>,
): Promise<Bytes> {
  const receiverPublicKey = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  if (receiverPublicKey.length !== 65) throw new Error("PUSH_P256DH_LENGTH");
  if (authSecret.length < 16) throw new Error("PUSH_AUTH_LENGTH");

  const senderKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const senderPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const receiverKey = await crypto.subtle.importKey("raw", toArrayBuffer(receiverPublicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, sharedSecret, concatBytes([utf8("WebPush: info\0"), receiverPublicKey, senderPublicKey]), 32);
  const salt = randomBytes(16);
  const prk = await hkdfExtract(salt, ikm);
  const contentEncryptionKey = await hkdfExpand(prk, PUSH_KEY_INFO, 16);
  const nonce = await hkdfExpand(prk, PUSH_NONCE_INFO, 12);
  const aesKey = await crypto.subtle.importKey("raw", toArrayBuffer(contentEncryptionKey), "AES-GCM", false, ["encrypt"]);

  const header = new Uint8Array(16 + 4 + 1 + senderPublicKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, PUSH_RECORD_SIZE, false);
  header[20] = senderPublicKey.length;
  header.set(senderPublicKey, 21);

  const payloadBytes = utf8(JSON.stringify(payload));
  const maxRecordPayload = PUSH_RECORD_SIZE - PUSH_AES_TAG_BYTES - 1;
  const records: Uint8Array[] = [header];
  let offset = 0;
  let counter = 0;
  while (offset < payloadBytes.length || counter === 0) {
    const end = Math.min(offset + maxRecordPayload, payloadBytes.length);
    const chunk = payloadBytes.slice(offset, end);
    const last = end >= payloadBytes.length;
    records.push(await encryptRecord(aesKey, nonce, counter, chunk, last));
    offset = end;
    counter += 1;
  }
  return concatBytes(records);
}

async function readResponseTextLimit(response: Response, limit = 1024): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    const slice = value.slice(0, Math.max(0, limit - size));
    chunks.push(slice);
    size += slice.length;
  }
  return new TextDecoder().decode(concatBytes(chunks)).trim();
}

export async function sendPushNotification(
  env: PushEnv,
  subscription: Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth" | "content_encoding">,
  payload: Record<string, unknown>,
) {
  if (getPushConfigError(env)) throw new Error("PUSH_CONFIG");
  const encrypted = await encryptPushPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: "normal",
      Authorization: await buildVapidAuthorization(subscription.endpoint, env),
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
    },
    body: toArrayBuffer(encrypted),
  });
  if (!response.ok) {
    const details = await readResponseTextLimit(response);
    const err = new Error(details ? `PUSH_HTTP_${response.status}: ${details}` : `PUSH_HTTP_${response.status}`);
    (err as Error & { statusCode?: number }).statusCode = response.status;
    throw err;
  }
  return response;
}

export function buildPushPayload(input: {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  actions?: Array<{ action: string; title: string }>;
  data?: Record<string, unknown>;
}) {
  return {
    title: input.title || "FitFocus",
    body: input.body || "У вас новое уведомление от FitFocus.",
    url: input.url || "/",
    tag: input.tag || `fitfocus-${uuid()}`,
    icon: input.icon || "/icon.svg",
    badge: input.badge || "/icon.svg",
    actions: input.actions || [{ action: "open", title: "Открыть" }],
    data: {
      ...(input.data || {}),
      url: input.url || "/",
      createdAt: nowMs(),
    },
  };
}
