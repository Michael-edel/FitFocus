import { uuid } from './db';
import { createSupportTicket } from './support_ticket_create';
import {
  deleteStoredSupportAttachments,
  fileToAttachment,
  SupportAttachmentTooLargeError,
  type SupportAttachmentBucket,
  type SupportAttachmentRecord,
} from './support_attachments';

function parseSteps(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? JSON.stringify(lines) : null;
}

function detectBrowserFromUserAgent(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return 'Chrome';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return 'Safari';
  return '';
}

function detectDeviceFromUserAgent(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iPhone / iPad';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return '';
}

function buildSystemContext(request: Request, clientContext: string) {
  const userAgent = request.headers.get('user-agent') || '';
  const rawClient = clientContext.trim();
  const client = rawClient.length > 4000 ? `${rawClient.slice(0, 4000)}...` : rawClient;
  const lines = [
    'Серверная диагностика:',
    `Detected device: ${detectDeviceFromUserAgent(userAgent) || 'unknown'}`,
    `Detected browser: ${detectBrowserFromUserAgent(userAgent) || 'unknown'}`,
    `User-Agent: ${userAgent || 'unknown'}`,
    `Sec-CH-UA: ${request.headers.get('sec-ch-ua') || 'unknown'}`,
    `Sec-CH-UA-Platform: ${request.headers.get('sec-ch-ua-platform') || 'unknown'}`,
    `Sec-CH-UA-Mobile: ${request.headers.get('sec-ch-ua-mobile') || 'unknown'}`,
    `CF-IPCountry: ${request.headers.get('cf-ipcountry') || 'unknown'}`,
    `CF-Ray: ${request.headers.get('cf-ray') || 'unknown'}`,
    `Received: ${new Date().toISOString()}`,
  ];
  if (client) lines.push('', 'Клиентская диагностика:', client.length > 4000 ? `${client.slice(0, 4000)}...` : client);
  return lines.join('\n');
}

export type SupportTicketSubmission =
  | { kind: 'validation'; fields: string[] }
  | { kind: 'too-many-attachments' }
  | { kind: 'attachment-too-large' }
  | { kind: 'attachment-processing-failed' }
  | { kind: 'success'; ticketId: string; attachmentCount: number };

/** Validates a support form, captures bounded diagnostics, and creates its ticket with compensating R2 cleanup. */
export async function submitSupportTicket({
  db,
  userId,
  bucket,
  request,
  form,
}: {
  db: D1Database;
  userId: string;
  bucket: SupportAttachmentBucket | undefined;
  request: Request;
  form: FormData;
}): Promise<SupportTicketSubmission> {
  const category = String(form.get('category') || '').trim() || 'Ошибка';
  const section = String(form.get('section') || '').trim() || 'Другое';
  const subject = String(form.get('subject') || '').trim();
  const message = String(form.get('message') || '').trim();
  const files = form.getAll('attachments').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const fields: string[] = [];
  if (!subject) fields.push('subject');
  if (!message && files.length === 0) fields.push('message');
  if (fields.length) return { kind: 'validation', fields };
  if (files.length > 3) return { kind: 'too-many-attachments' };

  const userAgent = request.headers.get('user-agent') || '';
  const ticketId = uuid();
  const attachments: SupportAttachmentRecord[] = [];
  try {
    for (const [index, file] of files.entries()) {
      attachments.push(await fileToAttachment(file, { bucket, ticketId, index }));
    }
  } catch (error: unknown) {
    await deleteStoredSupportAttachments(bucket, attachments);
    return error instanceof SupportAttachmentTooLargeError
      ? { kind: 'attachment-too-large' }
      : { kind: 'attachment-processing-failed' };
  }

  try {
    const created = await createSupportTicket({
      db,
      userId,
      input: {
        ticketId,
        category,
        section,
        subject,
        message,
        stepsJson: parseSteps(String(form.get('steps') || '').trim()),
        device: String(form.get('device') || '').trim() || detectDeviceFromUserAgent(userAgent),
        browser: String(form.get('browser') || '').trim() || detectBrowserFromUserAgent(userAgent),
        contact: String(form.get('contact') || '').trim(),
        appVersion: String(form.get('app_version') || '').trim(),
        adminNote: `Системная диагностика\n${buildSystemContext(request, String(form.get('system_context') || ''))}`,
        attachments,
      },
    });
    return { kind: 'success', ticketId: created.ticketId, attachmentCount: created.attachmentCount };
  } catch (error) {
    await deleteStoredSupportAttachments(bucket, attachments);
    throw error;
  }
}