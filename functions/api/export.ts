// Cloudflare Pages Function: /api/export
// GDPR-style export of user data stored in D1.

import { json, requireUser } from "./_lib/auth";
import { requireDB } from "./_lib/db";
import { safeJsonParse } from "./_lib/json";
import { parseAttachmentsJson, type SupportAttachmentRecord } from "./_lib/support_attachments";

type Env = { AUTH_JWT_SECRET: string; DB: D1Database };
type KvRow = { k: string; v: string; updated_at?: number; version?: number };
type PublicSupportAttachment = Pick<SupportAttachmentRecord, "name" | "mime" | "size" | "kind" | "data_url">;
type SupportFeedbackExportRow = Record<string, unknown> & { attachments_json?: string | null };
type SupportMessageExportRow = Record<string, unknown> & { attachments_json?: string | null };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const db = requireDB(env);
  const userId = user.sub;

  const dbUser = await db
    .prepare("SELECT id, email, name, picture, created_at, updated_at, deleted_at, deletion_scheduled_at, is_active FROM users WHERE id = ?")
    .bind(userId)
    .first();

  const profRow = await db
    .prepare("SELECT profile_json, updated_at, version FROM user_profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ profile_json: string; updated_at: number; version: number }>();

  const kv = await allRows(db, "SELECT k, v, updated_at, version FROM user_kv WHERE user_id = ? ORDER BY k", userId);
  const sessions = await allRows(db, "SELECT id, created_at, expires_at, revoked, user_agent, ip FROM sessions WHERE user_id = ? ORDER BY created_at DESC", userId);
  const roles = await allRows(db, "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role", userId);
  const subscriptions = await allRows(db, "SELECT plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at FROM subscriptions WHERE user_id = ?", userId);
  const usageDaily = await allRows(db, "SELECT day, feature, count FROM usage_daily WHERE user_id = ? ORDER BY day DESC, feature", userId);
  const aiEvents = await allRows(db, "SELECT id, ts, feature, status, latency_ms, safe_mode, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, is_fallback, request_json, response_json, error FROM ai_events WHERE user_id = ? ORDER BY ts DESC", userId);
  const aiRateLimits = await allRows(db, "SELECT kind, bucket_key, feature, window_start_ms, count, updated_at FROM ai_rate_limits WHERE user_id = ? ORDER BY updated_at DESC", userId);
  const userCostDaily = await allRows(db, "SELECT day, input_tokens, output_tokens, total_tokens, estimated_cost_usd, updated_at FROM user_cost_daily WHERE user_id = ? ORDER BY day DESC", userId);
  const pushSubscriptions = await allRows(db, "SELECT id, content_encoding, device_label, user_agent, created_at, updated_at, last_sent_at, last_error, enabled FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC", userId);
  const wearableConnections = await allRows(db, "SELECT id, provider, token_type, scope, expires_at, created_at, updated_at, last_sync_at, status, metadata_json FROM wearable_connections WHERE user_id = ? ORDER BY updated_at DESC", userId);
  const achievements = await allRows(db, "SELECT achievement_key, unlocked_at, tier, source, snapshot_json, created_at FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at DESC", userId);
  const inviteRedemptions = await allRows(db, "SELECT code, redeemed_at FROM invite_redemptions WHERE user_id = ? ORDER BY redeemed_at DESC", userId);
  const familyMemberships = await allRows(db, "SELECT id, family_id, role, status, display_name, restrictions_json, is_active, updated_at, sex, age, height_cm, weight_kg, activity, goal, created_at FROM family_members WHERE user_id = ? ORDER BY created_at DESC", userId);
  const ownedFamilies = await allRows(db, "SELECT id, name, is_active, created_at FROM families WHERE owner_user_id = ? ORDER BY created_at DESC", userId);
  const familyMenus = await allRows(db, "SELECT id, family_id, menu_json, created_at FROM family_menus WHERE family_id IN (SELECT id FROM families WHERE owner_user_id = ? UNION SELECT family_id FROM family_members WHERE user_id = ?)", userId, userId);
  const familyInvitesCreated = await allRows(db, "SELECT code, family_id, expires_at, created_by_user_id, created_at, used_by_user_id, used_at FROM family_invites WHERE created_by_user_id = ? ORDER BY created_at DESC", userId);
  const familyInvitesUsed = await allRows(db, "SELECT code, family_id, expires_at, created_by_user_id, created_at, used_by_user_id, used_at FROM family_invites WHERE used_by_user_id = ? ORDER BY used_at DESC", userId);
  const recipes = await allRows(db, "SELECT id, title, source_food_name, calories, protein, fat, carbs, ingredients_json, steps_json, allergens_json, created_at FROM recipes WHERE user_id = ? ORDER BY created_at DESC", userId);
  const weeklyMenuItems = await allRows(db, "SELECT id, family_id, week_start, ingredient_name, grams, category, created_at FROM weekly_menu_items WHERE user_id = ? ORDER BY week_start DESC, ingredient_name", userId);
  const weeklyMenusCreated = await allRows(db, "SELECT id, family_id, week_start, menu_json, created_at FROM weekly_menus WHERE created_by_user_id = ? ORDER BY created_at DESC", userId);
  const weeklyMenuPortions = await allRows(db, "SELECT weekly_menu_id, portions_json, totals_json, updated_at FROM weekly_menu_portions WHERE user_id = ? ORDER BY updated_at DESC", userId);
  const shoppingChecked = await allRows(db, "SELECT scope_id, week_start, family_id, ingredient_name, checked, updated_at FROM shopping_checked WHERE scope_id = ? OR scope_id = ? ORDER BY updated_at DESC", `personal:${userId}`, userId);
  const familyShoppingChecked = await allRows(db, "SELECT scope_id, week_start, family_id, ingredient_name, checked, updated_at FROM shopping_checked WHERE family_id IN (SELECT id FROM families WHERE owner_user_id = ? UNION SELECT family_id FROM family_members WHERE user_id = ?) ORDER BY updated_at DESC", userId, userId);
  const supportFeedback = await allRows<SupportFeedbackExportRow>(db, "SELECT id, user_id, created_at, updated_at, category, section, subject, message, steps_json, device, browser, contact, app_version, status, priority, attachment_count, attachments_json, resolved_at, closed_at, last_reply_at, last_reply_by FROM support_feedback WHERE user_id = ? ORDER BY created_at DESC", userId);
  const supportMessages = await allRows<SupportMessageExportRow>(db, "SELECT id, ticket_id, author_user_id, author_role, message, attachment_count, attachments_json, created_at FROM support_feedback_messages WHERE ticket_id IN (SELECT id FROM support_feedback WHERE user_id = ?) ORDER BY created_at ASC", userId);

  const payload = {
    generated_at: new Date().toISOString(),
    user: dbUser || user,
    profile: profRow?.profile_json ? safeParse(profRow.profile_json) : null,
    profile_updated_at: profRow?.updated_at ?? null,
    profile_version: profRow?.version ?? null,
    kv: kv.map((r: KvRow) => ({ key: r.k, value: r.v, updated_at: r.updated_at, version: r.version })),
    sessions,
    roles,
    subscriptions,
    usage_daily: usageDaily,
    ai_events: aiEvents,
    ai_rate_limits: aiRateLimits,
    user_cost_daily: userCostDaily,
    push_subscriptions: pushSubscriptions,
    wearable_connections: wearableConnections,
    achievements,
    invite_redemptions: inviteRedemptions,
    family_memberships: familyMemberships,
    owned_families: ownedFamilies,
    family_menus: familyMenus,
    family_invites_created: familyInvitesCreated,
    family_invites_used: familyInvitesUsed,
    recipes,
    weekly_menu_items: weeklyMenuItems,
    weekly_menus_created: weeklyMenusCreated,
    weekly_menu_portions: weeklyMenuPortions,
    shopping_checked: shoppingChecked,
    family_shopping_checked: familyShoppingChecked,
    support_feedback: publicSupportFeedbackRows(supportFeedback),
    support_messages: publicSupportMessageRows(supportMessages),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fitfocus-export-${date}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
};

function safeParse(s: string): unknown | null {
  return safeJsonParse(s);
}

function publicAttachments(value: unknown): PublicSupportAttachment[] {
  return parseAttachmentsJson(value).map((attachment) => {
    const record: PublicSupportAttachment = {
      name: attachment.name,
      mime: attachment.mime,
      size: attachment.size,
      kind: attachment.kind,
    };
    if (attachment.data_url) record.data_url = attachment.data_url;
    return record;
  });
}

function publicSupportFeedbackRows(rows: SupportFeedbackExportRow[]) {
  return rows.map(({ attachments_json, ...row }) => ({
    ...row,
    attachments: publicAttachments(attachments_json),
  }));
}

function publicSupportMessageRows(rows: SupportMessageExportRow[]) {
  return rows.map(({ attachments_json, ...row }) => ({
    ...row,
    attachments: publicAttachments(attachments_json),
  }));
}

async function allRows<T = Record<string, unknown>>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
  const { results } = await stmt.all<T>();
  return results || [];
}
