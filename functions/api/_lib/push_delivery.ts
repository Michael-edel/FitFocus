import { nowMs } from './db';
import { sendPushNotification, type PushEnv } from './push';
import type { Recipient } from './push_recipient_selection';

const PUSH_SEND_CONCURRENCY = 8;

function isGoneError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { statusCode?: unknown; status?: unknown; code?: unknown };
  const status = Number(value.statusCode || value.status || value.code || 0);
  return status === 404 || status === 410;
}

function errorDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as { statusCode?: unknown; status?: unknown; code?: unknown; message?: unknown } : null;
  const status = Number(value?.statusCode || value?.status || value?.code || 0);
  return {
    status: Number.isFinite(status) && status > 0 ? status : null,
    message: String(value?.message || error || 'PUSH_ERROR').slice(0, 240),
  };
}

export type PushDeliveryResult = {
  sent: number;
  failed: number;
  removed: number;
  failures: Array<{ id: string; status: number | null; message: string; removed: boolean }>;
};

/** Sends selected notifications with bounded concurrency and persists delivery outcomes in one batch. */
export async function deliverPushNotifications({
  db,
  env,
  recipients,
  payload,
}: {
  db: D1Database;
  env: PushEnv;
  recipients: Recipient[];
  payload: Record<string, unknown>;
}): Promise<PushDeliveryResult> {
  let sent = 0, failed = 0, removed = 0;
  const failures: PushDeliveryResult['failures'] = [];
  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < recipients.length; start += PUSH_SEND_CONCURRENCY) {
    const deliveries = await Promise.all(recipients.slice(start, start + PUSH_SEND_CONCURRENCY).map(async (recipient) => {
      try { await sendPushNotification(env, recipient, payload); return { recipient, error: null }; }
      catch (error) { return { recipient, error }; }
    }));
    for (const { recipient, error } of deliveries) {
      if (!error) {
        const sentAt = nowMs();
        statements.push(db.prepare('UPDATE push_subscriptions SET last_sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?').bind(sentAt, sentAt, recipient.id));
        sent += 1;
        continue;
      }
      failed += 1;
      const details = errorDetails(error), removedSubscription = isGoneError(error);
      failures.push({ id: recipient.id, ...details, removed: removedSubscription });
      if (removedSubscription) {
        statements.push(db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(recipient.id));
        removed += 1;
      } else {
        const updatedAt = nowMs();
        statements.push(db.prepare('UPDATE push_subscriptions SET last_error = ?, updated_at = ? WHERE id = ?').bind(details.message, updatedAt, recipient.id));
      }
    }
  }
  if (statements.length) await db.batch(statements);
  return { sent, failed, removed, failures };
}
