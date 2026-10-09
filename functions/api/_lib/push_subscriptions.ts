import { nowMs, uuid } from './db';
import {
  hasPushConfig,
  mergePushUserAgentWithBrowserHint,
  normalizePushBrowserLabel,
  normalizePushDeviceLabel,
  type PushEnv,
} from './push';

export type PushStatusRow = {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  created_at: number;
  updated_at: number;
  last_sent_at: number | null;
  last_error: string | null;
  enabled: number;
};

type CountRow = { count?: number };

export async function readPushStatus(input: {
  db: D1Database;
  env: PushEnv;
  userId: string;
  userAgent: string | null;
  browserLabelHeader: string | null;
  now?: () => Date;
}) {
  const { results } = await input.db
    .prepare('SELECT id, device_label, user_agent, created_at, updated_at, last_sent_at, last_error, enabled FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(input.userId)
    .all<PushStatusRow>();
  const subscriptions = (results || []).map((row) => ({ ...row, enabled: Number(row.enabled || 0) === 1 }));
  const currentDeviceLabel = normalizePushDeviceLabel(null, input.userAgent);
  const explicitBrowserLabel = String(input.browserLabelHeader || '').trim();
  const currentBrowserLabel = explicitBrowserLabel
    ? explicitBrowserLabel.slice(0, 120)
    : normalizePushBrowserLabel(input.userAgent, null);
  const enabledItems = subscriptions.filter((row) => row.enabled);
  const currentMatch = enabledItems.find((row) => (
    normalizePushDeviceLabel(row.device_label, row.user_agent) === currentDeviceLabel
      && normalizePushBrowserLabel(row.user_agent) === currentBrowserLabel
  )) || (enabledItems.length === 1 ? enabledItems[0] : null);

  return {
    ok: true,
    configured: hasPushConfig(input.env),
    vapid_public_key: input.env.PUSH_VAPID_PUBLIC_KEY || null,
    checked_at: (input.now || (() => new Date()))().toISOString(),
    count: subscriptions.length,
    current_subscription_id: currentMatch?.id || null,
    current_device_label: currentMatch?.device_label || currentDeviceLabel,
    current_browser_label: currentBrowserLabel,
    subscriptions,
  };
}

export async function savePushSubscription(input: {
  db: D1Database;
  userId: string;
  subscription: { endpoint: string; p256dh: string; auth: string; contentEncoding: string };
  deviceLabel: string;
  browserLabel?: string | null;
  userAgent: string | null;
  now?: () => number;
  id?: () => string;
}) {
  const timestamp = (input.now || nowMs)();
  const userAgent = mergePushUserAgentWithBrowserHint(input.userAgent, input.browserLabel);
  await input.db.prepare(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, content_encoding, device_label, user_agent, created_at, updated_at, last_sent_at, last_error, enabled) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, content_encoding = excluded.content_encoding, device_label = excluded.device_label, user_agent = excluded.user_agent, updated_at = excluded.updated_at, enabled = 1, last_error = NULL'
  ).bind((input.id || uuid)(), input.userId, input.subscription.endpoint, input.subscription.p256dh, input.subscription.auth, input.subscription.contentEncoding, input.deviceLabel, userAgent, timestamp, timestamp).run();
  const { results } = await input.db.prepare('SELECT COUNT(1) AS count FROM push_subscriptions WHERE user_id = ? AND enabled = 1').bind(input.userId).all<CountRow>();
  return { ok: true, count: Number(results?.[0]?.count || 0), deviceLabel: input.deviceLabel };
}

export async function removePushSubscription(input: { db: D1Database; userId: string; endpoint?: string; subscriptionId?: string }) {
  const statement = input.endpoint
    ? input.db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(input.userId, input.endpoint)
    : input.db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND id = ?').bind(input.userId, input.subscriptionId);
  const result = await statement.run();
  return { ok: true, removed: Number((result as { meta?: { changes?: number } }).meta?.changes || 0) };
}
