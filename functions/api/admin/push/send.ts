// Cloudflare Pages Function: /api/admin/push/send
// Admin-only push broadcast / segmented push sender.

import { requireUser, json } from "../../_lib/auth";
import { requireDB, nowMs } from "../../_lib/db";
import { requireRole } from "../../_lib/rbac";
import { requireAdminRequest } from "../../_lib/admin_guard";
import { buildAdminEventStatement } from "../../_lib/admin_audit";
import { buildPushPayload, normalizePushBrowserLabel, normalizePushDeviceLabel, sendPushNotification } from "../../_lib/push";
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

const PUSH_SEND_CONCURRENCY = 8;

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

function isGoneError(error: unknown) {
  if (!isJsonObject(error)) return false;
  const status = Number(error?.statusCode || error?.status || error?.code || 0);
  return status === 404 || status === 410;
}

function pushErrorDetails(error: unknown) {
  const errorObject = isJsonObject(error) ? error : null;
  const status = Number(errorObject?.statusCode || errorObject?.status || errorObject?.code || 0);
  const message = String(errorObject?.message || error || "PUSH_ERROR").slice(0, 240);
  return {
    status: Number.isFinite(status) && status > 0 ? status : null,
    message,
  };
}

function getPlan(profile: ParsedProfile, fallback: string | null) {
  return String(fallback || profile.plan || "free").toLowerCase();
}

function getSubscriptionStatus(profile: ParsedProfile, fallback: string | null) {
  return String(fallback || profile.subscriptionStatus || "inactive").toLowerCase();
}

function getRecipient(row: PushRecipientRow): Recipient {
  const profile = parseProfile(row.profile_json);
  const roles = asRoles(row.roles_csv);
  const device = normalizePushDeviceLabel(row.device_label, row.user_agent);
  const browser = normalizePushBrowserLabel(row.user_agent);
  const plan = getPlan(profile, row.subscription_plan);
  const subscriptionStatus = getSubscriptionStatus(profile, row.subscription_status);
  const active = asBoolean(row.is_active) && !row.deleted_at;
  const familyIds = asFamilyIds(row.active_family_ids);
  return {
    ...row,
    profile,
    roles,
    device,
    browser,
    plan,
    subscriptionStatus,
    active,
    familyIds,
  };
}

function matchesSegment(recipient: Recipient, segment: SegmentInput, userIds: Set<string>) {
  if (userIds.size && !userIds.has(recipient.user_id)) return false;

  const query = toText(segment.query);
  if (query) {
    const q = query.toLowerCase();
    const name = String(recipient.profile.name || "").toLowerCase();
    if (
      !String(recipient.user_id).toLowerCase().includes(q) &&
      !String(recipient.email || "").toLowerCase().includes(q) &&
      !name.includes(q)
    ) {
      return false;
    }
  }

  const status = toText(segment.status, "all").toLowerCase();
  if (status === "active" && !(recipient.is_active === 1 && !recipient.deleted_at)) return false;
  if (status === "inactive" && !(recipient.is_active === 0 && !recipient.deleted_at)) return false;
  if (status === "deleted" && !recipient.deleted_at) return false;

  const plan = toText(segment.plan, "all").toLowerCase();
  if (plan !== "all" && recipient.plan !== plan) return false;

  const wearable = toText(segment.wearable, "all").toLowerCase();
  const wearableEnabled = asBoolean(recipient.profile.wearableEnabled);
  if (wearable === "connected" && !wearableEnabled) return false;
  if (wearable === "disconnected" && wearableEnabled) return false;

  const glucose = toText(segment.glucose, "all").toLowerCase();
  const glucoseValue = recipient.profile.bloodGlucoseMmolL;
  if (glucose === "yes" && glucoseValue == null) return false;
  if (glucose === "no" && glucoseValue != null) return false;

  const measurements = toText(segment.measurements, "all").toLowerCase();
  const measurementsHistory = Array.isArray(recipient.profile.measurementsHistory) ? recipient.profile.measurementsHistory : [];
  const hasMeasurements =
    measurementsHistory.length > 0 ||
    recipient.profile.weight !== undefined ||
    recipient.profile.restingPulse !== undefined ||
    recipient.profile.bloodGlucoseMmolL !== undefined ||
    recipient.profile.bloodPressureSystolic !== undefined ||
    recipient.profile.bloodPressureDiastolic !== undefined;
  if (measurements === "yes" && !hasMeasurements) return false;
  if (measurements === "no" && hasMeasurements) return false;

  const role = toText(segment.role, "all").toLowerCase();
  if (role !== "all" && !recipient.roles.includes(role)) return false;

  const familyId = toText(segment.familyId);
  if (familyId && !recipient.familyIds.includes(familyId)) return false;

  const device = toText(segment.device, "all").toLowerCase();
  if (device !== "all" && recipient.device.toLowerCase() !== device) return false;

  const browser = toText(segment.browser, "all").toLowerCase();
  if (browser !== "all" && recipient.browser.toLowerCase() !== browser) return false;

  return true;
}

function sortRecipients(recipients: Recipient[], sort: string) {
  const order = sort.toLowerCase();
  const compareText = (a: string, b: string) => a.localeCompare(b, "ru", { sensitivity: "base" });
  const compareNumber = (a: number, b: number) => a - b;
  recipients.sort((a, b) => {
    switch (order) {
      case "created_asc":
        return compareNumber(a.created_at, b.created_at);
      case "created_desc":
        return compareNumber(b.created_at, a.created_at);
      case "updated_asc":
        return compareNumber(a.updated_at, b.updated_at);
      case "updated_desc":
        return compareNumber(b.updated_at, a.updated_at);
      case "last_sent_asc":
        return compareNumber(Number(a.last_sent_at || 0), Number(b.last_sent_at || 0)) || compareNumber(b.updated_at, a.updated_at);
      case "last_sent_desc":
        return compareNumber(Number(b.last_sent_at || 0), Number(a.last_sent_at || 0)) || compareNumber(b.updated_at, a.updated_at);
      case "email_asc":
        return compareText(String(a.email || ""), String(b.email || "")) || compareNumber(b.updated_at, a.updated_at);
      case "email_desc":
        return compareText(String(b.email || ""), String(a.email || "")) || compareNumber(b.updated_at, a.updated_at);
      case "device_asc":
        return compareText(a.device, b.device) || compareNumber(b.updated_at, a.updated_at);
      case "device_desc":
        return compareText(b.device, a.device) || compareNumber(b.updated_at, a.updated_at);
      case "browser_asc":
        return compareText(a.browser, b.browser) || compareNumber(b.updated_at, a.updated_at);
      case "browser_desc":
        return compareText(b.browser, a.browser) || compareNumber(b.updated_at, a.updated_at);
      case "plan_asc":
        return compareText(a.plan, b.plan) || compareNumber(b.updated_at, a.updated_at);
      case "plan_desc":
        return compareText(b.plan, a.plan) || compareNumber(b.updated_at, a.updated_at);
      default:
        return compareNumber(b.updated_at, a.updated_at);
    }
  });
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
  const allRecipients = (results || []).map((row) => getRecipient(row));
  const matchedRecipients = allRecipients.filter((recipient) => matchesSegment(recipient, segment, userIds));
  sortRecipients(matchedRecipients, sort);

  const selectedRecipients = matchedRecipients.slice(offset, offset + limit);
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

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const failures: Array<{ id: string; status: number | null; message: string; removed: boolean }> = [];
  const statements: D1PreparedStatement[] = [];

  for (let start = 0; start < selectedRecipients.length; start += PUSH_SEND_CONCURRENCY) {
    const batch = selectedRecipients.slice(start, start + PUSH_SEND_CONCURRENCY);
    const deliveries = await Promise.all(batch.map(async (recipient) => {
      try {
        await sendPushNotification(env, recipient, payload);
        return { recipient, error: null };
      } catch (error) {
        return { recipient, error };
      }
    }));

    for (const delivery of deliveries) {
      const { recipient, error } = delivery;
      if (!error) {
        const sentAt = nowMs();
        statements.push(
          db.prepare("UPDATE push_subscriptions SET last_sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?")
            .bind(sentAt, sentAt, recipient.id),
        );
        sent += 1;
        continue;
      }

      failed += 1;
      const details = pushErrorDetails(error);
      const removedSubscription = isGoneError(error);
      failures.push({
        id: recipient.id,
        ...details,
        removed: removedSubscription,
      });
      if (removedSubscription) {
        statements.push(db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(recipient.id));
        removed += 1;
      } else {
        const updatedAt = nowMs();
        statements.push(
          db.prepare("UPDATE push_subscriptions SET last_error = ?, updated_at = ? WHERE id = ?")
            .bind(details.message, updatedAt, recipient.id),
        );
      }
    }
  }

  if (statements.length) {
    await db.batch(statements);
  }

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
