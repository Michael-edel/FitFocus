// /api/invite/redeem
// Authenticated endpoint to redeem (consume) beta invite code for the current user.

import { json, requireUser } from "../_lib/auth";
import { requireDB, nowMs, toApiError } from "../_lib/db";
import { consumeInviteCode } from "../_lib/invites";

type Env = { DB: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env as any);
    const db = requireDB(env as any);

    const body: any = await request.json().catch(() => null);
    const code = String(body?.code || "").trim();

    if (!code) return json({ ok: false, error: "BAD_REQUEST" }, 400);

    const nowSec = Math.floor(nowMs() / 1000);
    const consumed = await consumeInviteCode(db, code, user.sub, nowSec);

    if (!consumed.ok) {
      return json({ ok: false, error: "INVITE_INVALID" }, 403);
    }

    return json({ ok: true, already: consumed.already || undefined }, 200);
  } catch (e: any) {
    const apiErr = toApiError(e);
    return json({ ok: false, error: apiErr }, 400);
  }
};
