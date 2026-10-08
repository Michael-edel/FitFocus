import { json, requireUser } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";
import { normalizeTicketStatus, updateSupportTicket } from '../_lib/support_ticket_admin';
import { createSupportTicket } from '../_lib/support_ticket_create';
import { listAdminSupportTickets, readAdminSupportTicketDetail } from '../_lib/support_ticket_admin_read';
import {
  readFormDataRequest,
  readJsonRequest,
  RequestBodyTooLargeError,
  SMALL_JSON_BODY_LIMIT_BYTES,
  SUPPORT_FORM_BODY_LIMIT_BYTES,
} from "../_lib/request_body";
import { type SupportAttachmentBucket } from '../_lib/support_attachments';
import { submitSupportTicket } from '../_lib/support_ticket_submission';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function handleSupportPost({ request, env }: Parameters<PagesFunction<Env>>[0]) {
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

  const result = await submitSupportTicket({ db, userId: user.sub, bucket: env.SUPPORT_ATTACHMENTS, request, form });
  if (result.kind === 'success') return json({ ok: true, ticket_id: result.ticketId, attachment_count: result.attachmentCount });
  if (result.kind === 'validation') {
    return json({ error: 'VALIDATION_ERROR', code: 'REQUIRED_FIELDS', public_message: 'Заполните обязательные поля.', fields: result.fields }, 400);
  }
  if (result.kind === 'too-many-attachments') {
    return json({ error: 'TOO_MANY_ATTACHMENTS', public_message: 'Можно отправить не больше 3 файлов.' }, 400);
  }
  if (result.kind === 'attachment-too-large') {
    return json({ error: 'ATTACHMENT_TOO_LARGE', public_message: 'Файл слишком большой. Прикрепите файл до 2 MB.' }, 400);
  }
  return json({ error: 'ATTACHMENT_PROCESSING_FAILED', public_message: 'Не удалось обработать вложение.' }, 400);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let response: Response;
  try {
    response = await handleSupportPost(context);
  } catch {
    response = json({ error: "SERVER_ERROR", public_message: "Не удалось отправить обращение. Попробуйте ещё раз позже." }, 500);
  }
  const requestId = requestIdFor(context.request);
  logApiEvent('support.create.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

const handleSupportPatch: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    requireRole(user, "admin");
  } catch {
    return json({ error: "FORBIDDEN" }, 403);
  }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  let body: Record<string, unknown> | null = null;
  try {
    body = await readJsonRequest<Record<string, unknown>>(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }
  if (!body) return json({ error: "BAD_REQUEST", message: "json required" }, 400);

  const result = await updateSupportTicket({ db, adminUserId: user.sub, body });
  if (result.kind === 'invalid') return json({ error: result.error, message: result.message }, 400);
  if (result.kind === 'not-found') return json({ error: 'NOT_FOUND', message: 'ticket not found' }, 404);

  const ticket = await readAdminSupportTicketDetail(db, result.ticketId);
  return json({
    ok: true,
    ticket,
  });
};

const handleSupportGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try {
    requireRole(user, "admin");
  } catch {
    return json({ error: "FORBIDDEN" }, 403);
  }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  const limit = Math.min(100, Math.max(1, toInt(url.searchParams.get("limit"), 20)));
  const status = normalizeTicketStatus(String(url.searchParams.get("status") || ""));

  if (id) {
    const ticket = await readAdminSupportTicketDetail(db, id);
    if (!ticket) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({
      ticket,
    });
  }
  return json({
    tickets: await listAdminSupportTickets(db, status, limit),
  });
};

/** Keeps support administration responses traceable without logging tickets or attachments. */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const response = await handleSupportPatch(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.admin.patch.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleSupportGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('support.admin.get.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
