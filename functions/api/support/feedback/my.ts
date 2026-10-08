import { json, requireUser } from "../../_lib/auth";
import { requireDB } from "../../_lib/db";
import {
  readFormDataRequest,
  RequestBodyTooLargeError,
  SUPPORT_FORM_BODY_LIMIT_BYTES,
} from "../../_lib/request_body";
import { type SupportAttachmentBucket } from "../../_lib/support_attachments";
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';
import {
  listMySupportTickets,
  readMySupportTicketDetail,
} from '../../_lib/support_ticket_user_read';
import { replyToMySupportTicket } from '../../_lib/support_ticket_user_reply';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

const handleMySupportGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();

  if (id) {
    const ticket = await readMySupportTicketDetail(db, user.sub, id);
    if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({ ticket });
  }

  return json({ tickets: await listMySupportTickets(db, user.sub) });
};

const handleMySupportPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  let form: FormData | null = null;
  try {
    form = await readFormDataRequest(request, SUPPORT_FORM_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!form) return json({ error: "BAD_REQUEST", message: "form data required" }, 400);

  const result = await replyToMySupportTicket({
    db,
    userId: user.sub,
    bucket: env.SUPPORT_ATTACHMENTS,
    form,
  });
  if (result.kind === 'success') return json({ ok: true, ticket: result.ticket });
  if (result.kind === 'not-found') return json({ error: 'NOT_FOUND', message: 'ticket not found' }, 404);
  if (result.kind === 'closed') return json({ error: 'BAD_REQUEST', message: 'ticket closed' }, 400);
  return json({ error: 'BAD_REQUEST', message: result.message }, 400);
};

/** Correlates support reads and replies without logging ticket content or attachments. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.my.get.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleMySupportPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.my.post.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};