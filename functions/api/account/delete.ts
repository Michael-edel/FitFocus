// Cloudflare Pages Function: POST /api/account/delete
// B2C-safe delete: soft delete + schedule hard delete in 30 days.
// Requires confirmation token in body: { confirm: "DELETE" }

import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { checkIfOwnerOfActiveFamily, ensureNotLastAdmin, softDeleteAccount } from "../_lib/account_delete";
import { asString } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function publicDeleteError(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return json({ ok: false, error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
  }
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTH" || code === "AUTH_CONFIG" || code === "DB_CONFIG") {
    return json({ ok: false, error: "UNAUTH" }, 401);
  }
  if (code.includes("последнего администратора")) {
    return json({
      ok: false,
      error: "ACCOUNT_DELETE_BLOCKED",
      message: "Удаление аккаунта сейчас заблокировано. Обратитесь в поддержку.",
    }, 409);
  }
  return json({ ok: false, error: "ACCOUNT_DELETE_FAILED" }, 500);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const t0 = Date.now();
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);

    const body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES).catch((error) => {
      if (error instanceof RequestBodyTooLargeError) throw error;
      return null;
    });
    const confirm = asString(body?.confirm).toUpperCase();
    if (confirm !== "DELETE") {
      return json({ ok: false, error: "CONFIRM_REQUIRED" }, 400);
    }

    await ensureNotLastAdmin(db, user.sub);
    const ownsActiveFamily = await checkIfOwnerOfActiveFamily(db, user.sub);
    if (ownsActiveFamily) {
      return json({
        ok: false,
        error: "FAMILY_OWNER_DELETE_BLOCKED",
        message: "Сначала передайте владельца семьи другому участнику или удалите семейный профиль.",
      }, 409);
    }
    await softDeleteAccount(db, user.sub);

    // Log event (non-AI, but reuse ai_events for audit)
    try {
      await db.prepare(
        "INSERT INTO ai_events (id, user_id, ts, feature, status, latency_ms, safe_mode, request_json, response_json, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(crypto.randomUUID(), user.sub, Date.now(), "account_delete", 200, Date.now() - t0, 0, null, null, null)
        .run();
    } catch {}

    const h = new Headers();
    // Clear cookie on client side too
    h.append("Set-Cookie", "ff_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return json({ ok: true, scheduled_days: 30 }, 200, h);
  } catch (error: unknown) {
    return publicDeleteError(error);
  }
};
