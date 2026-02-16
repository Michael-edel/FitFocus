// contentHash.ts — stable content hash for AI caching (device/server)
// Uses Web Crypto API (supported in modern browsers)
export async function sha256Base64(base64: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(base64);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
}
