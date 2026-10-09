import { nowMs } from './db';
import { sendPushNotification, type PushEnv, type PushSubscriptionRow } from './push';
import { isJsonObject } from './json';

function isGoneError(error: unknown) {
  if (!isJsonObject(error)) return false;
  const status = Number(error.statusCode || error.status || error.code || 0);
  return status === 404 || status === 410;
}

function pushErrorDetails(error: unknown) {
  const value = isJsonObject(error) ? error : null;
  const status = Number(value?.statusCode || value?.status || value?.code || 0);
  return { status: Number.isFinite(status) && status > 0 ? status : null, message: String(value?.message || error || 'PUSH_ERROR').slice(0, 240) };
}

export type PushTestDeliveryResult =
  | { kind: 'no-subscriptions' }
  | { kind: 'delivered'; sent: number; failed: number; removed: number; failures: Array<{ id: string; status: number | null; message: string; removed: boolean }> };

/** Sends a user-owned test payload and records delivery outcome for every active device. */
export async function deliverPushTest(input: { db: D1Database; env: PushEnv; userId: string; endpoint?: string; payload: Record<string, unknown> }): Promise<PushTestDeliveryResult> {
  const where = input.endpoint ? 'WHERE user_id = ? AND endpoint = ? AND enabled = 1' : 'WHERE user_id = ? AND enabled = 1';
  const binds = input.endpoint ? [input.userId, input.endpoint] : [input.userId];
  const { results } = await input.db.prepare(`SELECT id, user_id, endpoint, p256dh, auth, content_encoding FROM push_subscriptions ${where} ORDER BY updated_at DESC`).bind(...binds).all<PushSubscriptionRow>();
  if (!results?.length) return { kind: 'no-subscriptions' };
  let sent = 0; let failed = 0; let removed = 0;
  const failures: Array<{ id: string; status: number | null; message: string; removed: boolean }> = [];
  const statements: D1PreparedStatement[] = [];
  for (const subscription of results) {
    try {
      await sendPushNotification(input.env, subscription, input.payload);
      const now = nowMs(); statements.push(input.db.prepare('UPDATE push_subscriptions SET last_sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?').bind(now, now, subscription.id)); sent += 1;
    } catch (error) {
      failed += 1; const details = pushErrorDetails(error); const removedSubscription = isGoneError(error);
      failures.push({ id: String(subscription.id || ''), ...details, removed: removedSubscription });
      if (removedSubscription) { statements.push(input.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id)); removed += 1; }
      else statements.push(input.db.prepare('UPDATE push_subscriptions SET last_error = ?, updated_at = ? WHERE id = ?').bind(details.message, nowMs(), subscription.id));
    }
  }
  if (statements.length) await input.db.batch(statements);
  return { kind: 'delivered', sent, failed, removed, failures: failures.slice(0, 5) };
}
