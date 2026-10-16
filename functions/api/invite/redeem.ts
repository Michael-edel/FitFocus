// /api/invite/redeem
// Authenticated endpoint to redeem (consume) beta invite code for the current user.

import { json, requireUser } from "../_lib/auth";
import { requireDB, nowMs, toApiError } from "../_lib/db";
import { consumeInviteCode } from "../_lib/invites";
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { asString, isJsonObject } from "../_lib/json";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database };

const handleInviteRedeemPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const db = requireDB(env);

    let body: unknown = null;
    try {
      body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return json({ ok: false, error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    if (!isJsonObject(body)) return json({ ok: false, error: "BAD_REQUEST" }, 400);
    const code = asString(body.code);

    if (!code) return json({ ok: false, error: "BAD_REQUEST" }, 400);

    const nowSec = Math.floor(nowMs() / 1000);
    const consumed = await consumeInviteCode(db, code, user.sub, nowSec);

    if (!consumed.ok) {
      return json({ ok: false, error: "INVITE_INVALID" }, 403);
    }

    return json({ ok: true, already: consumed.already || undefined }, 200);
  } catch (e: unknown) {
    const apiErr = toApiError(e);
    return json({ ok: false, error: apiErr }, 400);
  }
};

/** Correlates invite activation outcomes without logging invitation codes or identity. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleInviteRedeemPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('invite.redeem.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
