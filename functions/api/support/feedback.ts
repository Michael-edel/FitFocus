import { json, requireUser } from "../_lib/auth";
import { requireDB, uuid } from "../_lib/db";
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
import { fileToAttachment, SupportAttachmentTooLargeError, type SupportAttachmentBucket, type SupportAttachmentRecord } from "../_lib/support_attachments";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string; SUPPORT_ATTACHMENTS?: SupportAttachmentBucket };

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseSteps(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? JSON.stringify(lines) : null;
}

function detectBrowserFromUserAgent(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "";
}

function detectDeviceFromUserAgent(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iPhone / iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "";
}

function clampContext(value: string, max = 4000) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

function buildSupportSystemContext(request: Request, clientContext: string) {
  const userAgent = request.headers.get("user-agent") || "";
  const secChUa = request.headers.get("sec-ch-ua") || "";
  const secChPlatform = request.headers.get("sec-ch-ua-platform") || "";
  const secChMobile = request.headers.get("sec-ch-ua-mobile") || "";
  const cfCountry = request.headers.get("cf-ipcountry") || "";
  const cfRay = request.headers.get("cf-ray") || "";
  const lines = [
    "Серверная диагностика:",
    `Detected device: ${detectDeviceFromUserAgent(userAgent) || "unknown"}`,
    `Detected browser: ${detectBrowserFromUserAgent(userAgent) || "unknown"}`,
    `User-Agent: ${userAgent || "unknown"}`,
    `Sec-CH-UA: ${secChUa || "unknown"}`,
    `Sec-CH-UA-Platform: ${secChPlatform || "unknown"}`,
    `Sec-CH-UA-Mobile: ${secChMobile || "unknown"}`,
    `CF-IPCountry: ${cfCountry || "unknown"}`,
    `CF-Ray: ${cfRay || "unknown"}`,
    `Received: ${new Date().toISOString()}`,
  ];
  const client = clampContext(clientContext);
  if (client) {
    lines.push("", "Клиентская диагностика:", client);
  }
  return lines.join("\n");
}

function supportValidationError(fields: string[]) {
  return json({
    error: "VALIDATION_ERROR",
    code: "REQUIRED_FIELDS",
    public_message: "Заполните обязательные поля.",
    fields,
  }, 400);
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

  const category = String(form.get("category") || "").trim() || "Ошибка";
  const section = String(form.get("section") || "").trim() || "Другое";
  const subject = String(form.get("subject") || "").trim();
  const message = String(form.get("message") || "").trim();
  const steps = String(form.get("steps") || "").trim();
  const device = String(form.get("device") || "").trim();
  const browser = String(form.get("browser") || "").trim();
  const contact = String(form.get("contact") || "").trim();
  const appVersion = String(form.get("app_version") || "").trim();
  const systemContext = buildSupportSystemContext(request, String(form.get("system_context") || ""));
  const storedDevice = device || detectDeviceFromUserAgent(request.headers.get("user-agent") || "");
  const storedBrowser = browser || detectBrowserFromUserAgent(request.headers.get("user-agent") || "");
  const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const missingFields: string[] = [];
  if (!subject) missingFields.push("subject");
  if (!message && files.length === 0) missingFields.push("message");
  if (missingFields.length > 0) return supportValidationError(missingFields);
  if (files.length > 3) return json({ error: "TOO_MANY_ATTACHMENTS", public_message: "Можно отправить не больше 3 файлов." }, 400);

  const storedMessage = message.trim();
  const storedAdminNote = systemContext ? `Системная диагностика\n${systemContext}` : null;

  const ticketId = uuid();
  const attachments: SupportAttachmentRecord[] = [];
  try {
    for (const [index, file] of files.entries()) {
      attachments.push(await fileToAttachment(file, { bucket: env.SUPPORT_ATTACHMENTS, ticketId, index }));
    }
  } catch (error: unknown) {
    if (error instanceof SupportAttachmentTooLargeError) {
      return json({ error: "ATTACHMENT_TOO_LARGE", public_message: "Файл слишком большой. Прикрепите файл до 2 MB." }, 400);
    }
    return json({ error: "ATTACHMENT_PROCESSING_FAILED", public_message: "Не удалось обработать вложение." }, 400);
  }

  const created = await createSupportTicket({
    db,
    userId: user.sub,
    input: {
      ticketId,
      category,
      section,
      subject,
      message: storedMessage,
      stepsJson: parseSteps(steps),
      device: storedDevice,
      browser: storedBrowser,
      contact,
      appVersion,
      adminNote: storedAdminNote,
      attachments,
    },
  });

  return json({
    ok: true,
    ticket_id: created.ticketId,
    attachment_count: created.attachmentCount,
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    return await handleSupportPost(context);
  } catch {
    return json({ error: "SERVER_ERROR", public_message: "Не удалось отправить обращение. Попробуйте ещё раз позже." }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
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
