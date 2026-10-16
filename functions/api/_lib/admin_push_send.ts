import { nowMs } from './db';
import { buildAdminEventStatement } from './admin_audit';
import { buildPushPayload, type PushEnv } from './push';
import {
  normalizeStringArray,
  selectPushRecipients,
  toInt,
  toText,
  type PushRecipientRow,
  type SegmentInput,
} from './push_recipient_selection';
import { deliverPushNotifications } from './push_delivery';
import { asString, isJsonObject, type JsonObject } from './json';

export type AdminPushSendEnv = PushEnv & {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
};

export type AdminPushSendBody = {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
  icon?: unknown;
  badge?: unknown;
  actions?: unknown;
  data?: unknown;
  dryRun?: unknown;
  limit?: unknown;
  offset?: unknown;
  sort?: unknown;
  userIds?: unknown;
  segment?: SegmentInput;
};

function previewRecipients(recipients: ReturnType<typeof selectPushRecipients>['selectedRecipients']) {
  return recipients.slice(0, 20).map((recipient) => ({
    subscription_id: recipient.id,
    user_id: recipient.user_id,
    email: recipient.email,
    device: recipient.device,
    browser: recipient.browser,
    plan: recipient.plan,
    roles: recipient.roles,
  }));
}

/** Executes the administrative push command after the HTTP layer has authenticated the administrator. */
export async function executeAdminPushSend({
  db,
  env,
  adminUserId,
  body,
}: {
  db: D1Database;
  env: AdminPushSendEnv;
  adminUserId: string;
  body: JsonObject | null;
}) {
  const segment = isJsonObject(body?.segment) ? body.segment : {};
  const userIds = new Set([
    ...normalizeStringArray(body?.userIds),
    ...normalizeStringArray(segment.userIds),
  ]);
  const limit = toInt(body?.limit, 100, 1, 500);
  const offset = toInt(body?.offset, 0, 0, 100000);
  const sort = toText(body?.sort, 'updated_desc');
  const dryRun = body?.dryRun === true || body?.dryRun === 1 || body?.dryRun === '1';
  const query = `
    SELECT ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth, ps.content_encoding,
      ps.device_label, ps.user_agent, ps.created_at, ps.updated_at, ps.last_sent_at,
      ps.last_error, ps.enabled, u.email, u.created_at AS user_created_at, u.deleted_at,
      u.deletion_scheduled_at, u.is_active,
      COALESCE((SELECT s.plan FROM subscriptions s WHERE s.user_id = u.id
        AND s.status IN ('active', 'trialing') AND (s.current_period_end IS NULL OR s.current_period_end > ?)
        ORDER BY s.updated_at DESC LIMIT 1), 'free') AS subscription_plan,
      COALESCE((SELECT s.status FROM subscriptions s WHERE s.user_id = u.id
        AND s.status IN ('active', 'trialing') AND (s.current_period_end IS NULL OR s.current_period_end > ?)
        ORDER BY s.updated_at DESC LIMIT 1), 'inactive') AS subscription_status,
      (SELECT s.current_period_end FROM subscriptions s WHERE s.user_id = u.id
        AND s.status IN ('active', 'trialing') AND (s.current_period_end IS NULL OR s.current_period_end > ?)
        ORDER BY s.updated_at DESC LIMIT 1) AS current_period_end,
      p.profile_json, GROUP_CONCAT(DISTINCT ur.role) AS roles_csv,
      (SELECT GROUP_CONCAT(DISTINCT fm.family_id) FROM family_members fm
        WHERE fm.user_id = ps.user_id AND fm.status = 'active' AND fm.is_active = 1) AS active_family_ids
    FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE ps.enabled = 1 GROUP BY ps.id ORDER BY ps.updated_at DESC
  `;
  const { results } = await db.prepare(query).bind(nowMs(), nowMs(), nowMs()).all<PushRecipientRow>();
  const { allRecipients, matchedRecipients, selectedRecipients } = selectPushRecipients(results || [], segment, userIds, sort, offset, limit);
  const actions = Array.isArray(body?.actions)
    ? body.actions.filter((item): item is JsonObject => isJsonObject(item))
      .map((item) => ({ action: asString(item.action), title: asString(item.title) }))
      .filter((item) => item.action && item.title)
    : undefined;
  const payload = buildPushPayload({
    title: toText(body?.title, 'FitFocus'), body: toText(body?.body, 'У вас новое уведомление от FitFocus.'),
    url: toText(body?.url, '/'), tag: toText(body?.tag, `fitfocus-admin-${Date.now()}`),
    icon: toText(body?.icon, '/icon.svg'), badge: toText(body?.badge, '/icon.svg'), actions,
    data: isJsonObject(body?.data) ? body.data : undefined,
  });
  const base = {
    ok: true, total_candidates: allRecipients.length, matched: matchedRecipients.length,
    selected: selectedRecipients.length, limit, offset, sort, segment, payload,
  };
  if (dryRun) {
    await buildAdminEventStatement(db, { adminUserId, action: 'push_send_dry_run', meta: { segment, sort, limit, offset, total: allRecipients.length, matched: matchedRecipients.length, selected: selectedRecipients.length } }).run();
    return { ...base, dry_run: true, preview: previewRecipients(selectedRecipients) };
  }
  if (!selectedRecipients.length) {
    await buildAdminEventStatement(db, { adminUserId, action: 'push_send', meta: { segment, sort, limit, offset, total: allRecipients.length, matched: matchedRecipients.length, selected: 0, sent: 0, failed: 0, removed: 0 } }).run();
    return { ...base, dry_run: false, sent: 0, failed: 0, removed: 0, preview: [] };
  }
  const { sent, failed, removed, failures } = await deliverPushNotifications({ db, env, recipients: selectedRecipients, payload });
  await buildAdminEventStatement(db, { adminUserId, action: 'push_send', meta: { segment, sort, limit, offset, total: allRecipients.length, matched: matchedRecipients.length, selected: selectedRecipients.length, sent, failed, removed } }).run();
  return { ...base, dry_run: false, sent, failed, removed, failures: failures.slice(0, 5), preview: previewRecipients(selectedRecipients) };
}
