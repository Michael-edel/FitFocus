// Cloudflare Pages Function: POST /api/account/delete
// B2C-safe delete: soft delete + schedule hard delete in 30 days.
// Requires confirmation token in body: { confirm: "DELETE" }

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { softDeleteAccount, ensureNotLastAdmin } from "../_lib/account_delete";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const t0 = Date.now();
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);

    let body: any = null;
    try { body = await request.json(); } catch {}
    const confirm = String(body?.confirm || "").trim().toUpperCase();
    if (confirm !== "DELETE") {
      return json({ ok: false, error: "CONFIRM_REQUIRED" }, 400);
    }

    await ensureNotLastAdmin(db, user.sub);
    await softDeleteAccount(db, user.sub);

    // Log event (non-AI, but reuse ai_events for audit)
    try {
      await db.prepare(
        "INSERT INTO ai_events (id, user_id, ts, feature, status, latency_ms, safe_mode, request_json, response_json, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(crypto.randomUUID(), user.sub, Date.now(), "account_delete", 200, Date.now() - t0, 0, JSON.stringify({}), JSON.stringify({ ok: true }), null)
        .run();
    } catch {}

    const h = new Headers();
    // Clear cookie on client side too
    h.append("Set-Cookie", "ff_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return json({ ok: true, scheduled_days: 30 }, 200, h);
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const code = msg.includes("последнего администратора") ? 409 : 401;
    return json({ ok: false, error: msg }, code);
  }
};
