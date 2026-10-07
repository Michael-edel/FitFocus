// Cloudflare Pages Function: /api/admin/push/send
// Admin-only push broadcast / segmented push sender.

import { requireUser, json } from "../../_lib/auth";
import { requireDB, nowMs } from "../../_lib/db";
import { requireRole } from "../../_lib/rbac";
import { requireAdminRequest } from "../../_lib/admin_guard";
import { buildAdminEventStatement } from "../../_lib/admin_audit";
import { buildPushPayload } from "../../_lib/push";
import { selectPushRecipients } from '../../_lib/push_recipient_selection';
import { deliverPushNotifications } from '../../_lib/push_delivery';
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../../_lib/request_body";
import { asBoolean, asString, asStringArray, isJsonObject, safeJsonParseObject, type JsonObject } from "../../_lib/json";

type Env = {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

type SegmentInput = {
  query?: unknown;
  status?: unknown;
  plan?: unknown;
  wearable?: unknown;
  glucose?: unknown;
  measurements?: unknown;
  role?: unknown;
  familyId?: unknown;
  device?: unknown;
  browser?: unknown;
  userIds?: unknown;
};

type PushSendBody = {
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

type PushRecipientRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  content_encoding: string | null;
  device_label: string | null;
  user_agent: string | null;
  created_at: number;
  updated_at: number;
  last_sent_at: number | null;
  last_error: string | null;
  enabled: number;
  email: string | null;
  user_created_at: number | null;
  deleted_at: string | null;
  deletion_scheduled_at: string | null;
  is_active: number | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  current_period_end: number | null;
  profile_json: string | null;
  roles_csv: string | null;
  active_family_ids?: string | null;
};

type ParsedProfile = JsonObject;

type Recipient = PushRecipientRow & {
  profile: ParsedProfile;
  roles: string[];
  device: string;
  browser: string;
  plan: string;
  subscriptionStatus: string;
  active: boolean;
  familyIds: string[];
};

function toText(value: unknown, fallback = "") {
  return asString(value, fallback);
}

function toInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseProfile(profileJson: unknown): ParsedProfile {
  if (!profileJson) return {};
  return safeJsonParseObject(String(profileJson)) ?? {};
}

function asRoles(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asFamilyIds(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStringArray(value: unknown): string[] {
  return asStringArray(value);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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

  let body: JsonObject | null = null;
  try {
    body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw err;
  }

  const segment = isJsonObject(body?.segment) ? body.segment : {};
  const userIds = new Set([
    ...normalizeStringArray(body?.userIds),
    ...normalizeStringArray(segment.userIds),
  ]);

  const limit = toInt(body?.limit, 100, 1, 500);
  const offset = toInt(body?.offset, 0, 0, 100000);
  const sort = toText(body?.sort, "updated_desc");
  const dryRun = body?.dryRun === true || body?.dryRun === 1 || body?.dryRun === "1";

  const query = `
    SELECT
      ps.id,
      ps.user_id,
      ps.endpoint,
      ps.p256dh,
      ps.auth,
      ps.content_encoding,
      ps.device_label,
      ps.user_agent,
      ps.created_at,
      ps.updated_at,
      ps.last_sent_at,
      ps.last_error,
      ps.enabled,
      u.email,
      u.created_at AS user_created_at,
      u.deleted_at,
      u.deletion_scheduled_at,
      u.is_active,
      COALESCE((
        SELECT s.plan
        FROM subscriptions s
        WHERE s.user_id = u.id
          AND s.status IN ('active', 'trialing')
          AND (s.current_period_end IS NULL OR s.current_period_end > ?)
        ORDER BY s.updated_at DESC
        LIMIT 1
      ), 'free') AS subscription_plan,
      COALESCE((
        SELECT s.status
        FROM subscriptions s
        WHERE s.user_id = u.id
          AND s.status IN ('active', 'trialing')
          AND (s.current_period_end IS NULL OR s.current_period_end > ?)
        ORDER BY s.updated_at DESC
        LIMIT 1
      ), 'inactive') AS subscription_status,
      (
        SELECT s.current_period_end
        FROM subscriptions s
        WHERE s.user_id = u.id
          AND s.status IN ('active', 'trialing')
          AND (s.current_period_end IS NULL OR s.current_period_end > ?)
        ORDER BY s.updated_at DESC
        LIMIT 1
      ) AS current_period_end,
      p.profile_json,
      GROUP_CONCAT(DISTINCT ur.role) AS roles_csv,
      (
        SELECT GROUP_CONCAT(DISTINCT fm.family_id)
        FROM family_members fm
        WHERE fm.user_id = ps.user_id AND fm.status = 'active' AND fm.is_active = 1
      ) AS active_family_ids
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE ps.enabled = 1
    GROUP BY ps.id
    ORDER BY ps.updated_at DESC
  `;
  const { results } = await db.prepare(query).bind(nowMs(), nowMs(), nowMs()).all<PushRecipientRow>();
  const { allRecipients, matchedRecipients, selectedRecipients } = selectPushRecipients(results || [], segment, userIds, sort, offset, limit);
  const actions = Array.isArray(body?.actions)
    ? body.actions
        .filter((item): item is JsonObject => isJsonObject(item))
        .map((item) => ({ action: asString(item.action), title: asString(item.title) }))
        .filter((item) => item.action && item.title)
    : undefined;

  const payload = buildPushPayload({
    title: toText(body?.title, "FitFocus"),
    body: toText(body?.body, "У вас новое уведомление от FitFocus."),
    url: toText(body?.url, "/"),
    tag: toText(body?.tag, `fitfocus-admin-${Date.now()}`),
    icon: toText(body?.icon, "/icon.svg"),
    badge: toText(body?.badge, "/icon.svg"),
    actions,
    data: isJsonObject(body?.data) ? body.data : undefined,
  });

  if (dryRun) {
    const auditStatement = buildAdminEventStatement(db, {
      adminUserId: user.sub,
      action: "push_send_dry_run",
      meta: {
        segment,
        sort,
        limit,
        offset,
        total: allRecipients.length,
        matched: matchedRecipients.length,
        selected: selectedRecipients.length,
      },
    });
    await auditStatement.run();

    return json({
      ok: true,
      dry_run: true,
      total_candidates: allRecipients.length,
      matched: matchedRecipients.length,
      selected: selectedRecipients.length,
      limit,
      offset,
      sort,
      segment,
      preview: selectedRecipients.slice(0, 20).map((recipient) => ({
        subscription_id: recipient.id,
        user_id: recipient.user_id,
        email: recipient.email,
        device: recipient.device,
        browser: recipient.browser,
        plan: recipient.plan,
        roles: recipient.roles,
      })),
      payload,
    }, 200);
  }

  if (!selectedRecipients.length) {
    const auditStatement = buildAdminEventStatement(db, {
      adminUserId: user.sub,
      action: "push_send",
      meta: {
        segment,
        sort,
        limit,
        offset,
        total: allRecipients.length,
        matched: matchedRecipients.length,
        selected: 0,
        sent: 0,
        failed: 0,
        removed: 0,
      },
    });
    await auditStatement.run();

    return json({
      ok: true,
      dry_run: false,
      total_candidates: allRecipients.length,
      matched: matchedRecipients.length,
      selected: 0,
      limit,
      offset,
      sort,
      segment,
      sent: 0,
      failed: 0,
      removed: 0,
      preview: [],
      payload,
    }, 200);
  }

  const { sent, failed, removed, failures } = await deliverPushNotifications({
    db,
    env,
    recipients: selectedRecipients,
    payload,
  });

  const auditStatement = buildAdminEventStatement(db, {
    adminUserId: user.sub,
    action: "push_send",
    meta: {
      segment,
      sort,
      limit,
      offset,
      total: allRecipients.length,
      matched: matchedRecipients.length,
      selected: selectedRecipients.length,
      sent,
      failed,
      removed,
    },
  });
  await auditStatement.run();

  return json({
    ok: true,
    dry_run: false,
    total_candidates: allRecipients.length,
    matched: matchedRecipients.length,
    selected: selectedRecipients.length,
    limit,
    offset,
    sort,
    segment,
    sent,
    failed,
    removed,
    failures: failures.slice(0, 5),
    preview: selectedRecipients.slice(0, 20).map((recipient) => ({
      subscription_id: recipient.id,
      user_id: recipient.user_id,
      email: recipient.email,
      device: recipient.device,
      browser: recipient.browser,
      plan: recipient.plan,
      roles: recipient.roles,
    })),
    payload,
  }, 200);
};
