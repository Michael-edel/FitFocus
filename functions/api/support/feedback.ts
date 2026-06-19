import { json, requireUser } from "../_lib/auth";
import { requireDB, uuid } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

type AttachmentRow = {
  name: string;
  mime: string;
  size: number;
  kind: string;
  data_url: string;
};

function ensureSupportTable(db: D1Database) {
  return db.prepare(`
    CREATE TABLE IF NOT EXISTS support_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      section TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      steps_json TEXT,
      device TEXT,
      browser TEXT,
      contact TEXT,
      app_version TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      priority TEXT NOT NULL DEFAULT 'normal',
      attachment_count INTEGER NOT NULL DEFAULT 0,
      attachments_json TEXT,
      admin_note TEXT
    )
  `).run();
}

function kindFromMime(mime: string) {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fileToAttachment(file: File): Promise<AttachmentRow> {
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`FILE_TOO_LARGE:${file.name}`);
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const base64 = bytesToBase64(bytes);
  const mime = file.type || "application/octet-stream";
  return {
    name: file.name || "attachment",
    mime,
    size: file.size,
    kind: kindFromMime(mime),
    data_url: `data:${mime};base64,${base64}`,
  };
}

function parseAttachmentsJson(value: unknown): AttachmentRow[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(String(value));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  await ensureSupportTable(db);

  const form = await request.formData().catch(() => null);
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

  if (!message) return json({ error: "BAD_REQUEST", message: "message required" }, 400);

  const files = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > 3) return json({ error: "BAD_REQUEST", message: "Too many attachments" }, 400);

  const attachments: AttachmentRow[] = [];
  try {
    for (const file of files) {
      attachments.push(await fileToAttachment(file));
    }
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.startsWith("FILE_TOO_LARGE:")) {
      return json({ error: "BAD_REQUEST", message: `Файл ${msg.split(":")[1]} слишком большой. Прикрепите файл до 2 MB.` }, 400);
    }
    return json({ error: "BAD_REQUEST", message: "Не удалось обработать вложение" }, 400);
  }

  const ticketId = uuid();
  const now = Date.now();
  await db.prepare(
    `INSERT INTO support_feedback (
      id, user_id, created_at, updated_at, category, section, subject, message, steps_json,
      device, browser, contact, app_version, status, priority, attachment_count, attachments_json, admin_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'normal', ?, ?, NULL)`
  ).bind(
    ticketId,
    user.sub,
    now,
    now,
    category,
    section,
    subject,
    message,
    steps ? JSON.stringify(steps.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) : null,
    device,
    browser,
    contact,
    appVersion,
    attachments.length,
    attachments.length ? JSON.stringify(attachments) : null,
  ).run();

  return json({
    ok: true,
    ticket_id: ticketId,
    attachment_count: attachments.length,
  });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);
  await ensureSupportTable(db);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "20")));

  if (id) {
    const row = await db.prepare(
      `SELECT s.*, u.email as user_email, u.name as user_name
       FROM support_feedback s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
       LIMIT 1`
    ).bind(id).first<any>();
    if (!row) return json({ error: "NOT_FOUND", message: "ticket not found" }, 404);
    return json({
      ticket: {
        ...row,
        attachment_count: Number(row.attachment_count || 0),
        attachments: parseAttachmentsJson(row.attachments_json),
      },
    });
  }

  const { results } = await db.prepare(
    `SELECT s.id, s.user_id, s.created_at, s.updated_at, s.category, s.section, s.subject, s.message,
            s.steps_json, s.device, s.browser, s.contact, s.app_version, s.status, s.priority,
            s.attachment_count,
            u.email as user_email, u.name as user_name
     FROM support_feedback s
     LEFT JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC
     LIMIT ?`
  ).bind(limit).all<any>();

  return json({
    tickets: (results || []).map((row) => ({
      ...row,
      attachment_count: Number(row.attachment_count || 0),
    })),
  });
};
