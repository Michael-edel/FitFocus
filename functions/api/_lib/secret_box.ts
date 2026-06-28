const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const pad = value.length % 4 ? "=".repeat(4 - (value.length % 4)) : "";
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function encryptSecretValue(value: string, secret: string): Promise<string> {
  if (!secret.trim()) throw new Error("SECRET_BOX_KEY_MISSING");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, enc.encode(value));
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(cipher))}`;
}

export async function decryptSecretValue(boxed: string, secret: string): Promise<string> {
  if (!secret.trim()) throw new Error("SECRET_BOX_KEY_MISSING");
  const parts = boxed.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("SECRET_BOX_BAD_FORMAT");
  const iv = base64UrlDecode(parts[1]);
  const cipher = base64UrlDecode(parts[2]);
  const key = await deriveAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(cipher));
  return dec.decode(plain);
}
