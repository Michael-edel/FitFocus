// POST /api/internal/cleanup_deleted
// Machine endpoint for scheduled cleanup. Protected by CRON_SECRET bearer token.

import { cleanupDeletedAccounts } from "../_lib/account_cleanup";
import { json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import type { SupportAttachmentBucket } from "../_lib/support_attachments";

type Env = { DB: D1Database; CRON_SECRET?: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

function getBearerToken(request: Request): string {
  const raw = request.headers.get("Authorization") || "";
  const prefix = "Bearer ";
  return raw.startsWith(prefix) ? raw.slice(prefix.length).trim() : "";
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sameSecret(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const ah = await sha256Hex(a);
  const bh = await sha256Hex(b);
  let diff = ah.length ^ bh.length;
  const len = Math.max(ah.length, bh.length);
  for (let i = 0; i < len; i++) {
    diff |= (ah.charCodeAt(i) || 0) ^ (bh.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.CRON_SECRET) {
    return json({ ok: false, error: "CRON_SECRET_NOT_CONFIGURED" }, 503);
  }

  const token = getBearerToken(request);
  if (!(await sameSecret(token, env.CRON_SECRET))) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  let limit = 200;
  try {
    const body = await request.json();
    if (body?.limit) limit = Math.min(200, Math.max(1, Number(body.limit)));
  } catch {}

  const db = requireDB(env);
  const result = await cleanupDeletedAccounts(db, {
    limit,
    actorUserId: "system:cron",
    logAction: "cleanup_deleted_scheduled",
    supportAttachments: env.SUPPORT_ATTACHMENTS,
  });

  return json(result, 200);
};
