// D1 helper utilities
import { errRu } from "./auth";

export type EnvWithDB = { DB?: D1Database };

export function requireDB(env: EnvWithDB): D1Database {
  if (!env.DB) throw new Error("DB_CONFIG");
  return env.DB;
}

export function nowMs() {
  return Date.now();
}

export function uuid() {
  // Cloudflare Workers has crypto.randomUUID()
  return crypto.randomUUID();
}

export function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function ensureUserRow(db: D1Database, user: { sub: string; email?: string }) {
  const created_at = Math.floor(Date.now() / 1000);
  await db
    .prepare("INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(user.sub, user.email || null, created_at)
    .run();
}

export function toApiError(e: unknown) {
  const code = e instanceof Error ? e.message : "BAD_REQUEST";
  return errRu(code);
}
