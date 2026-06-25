import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    console.error(`${label}: missing ${needle}`);
    process.exitCode = 1;
  }
}

function assertNotIncludes(text, needle, label) {
  if (text.includes(needle)) {
    console.error(`${label}: unexpected ${needle}`);
    process.exitCode = 1;
  }
}

function assertOrder(text, before, after, label) {
  const beforeIndex = text.indexOf(before);
  const afterIndex = text.indexOf(after);
  if (beforeIndex === -1 || afterIndex === -1 || beforeIndex > afterIndex) {
    console.error(`${label}: expected ${before} before ${after}`);
    process.exitCode = 1;
  }
}

const familyJoin = read('functions/api/family/join.ts');
assertIncludes(
  familyJoin,
  'WHERE code = ? AND used_by_user_id IS NULL',
  'family join must claim invites atomically',
);
assertIncludes(
  familyJoin,
  'AND expires_at >= ?',
  'family join must include invite expiry in the atomic claim',
);
assertIncludes(
  familyJoin,
  'WHERE (SELECT COUNT(*) FROM family_members WHERE family_id = ? AND status =',
  'family join must enforce member limit during insert',
);
assertIncludes(
  familyJoin,
  'UPDATE family_invites SET used_by_user_id = NULL, used_at = NULL',
  'family join must release invite when member insert fails',
);
assertIncludes(
  familyJoin,
  'AND NOT EXISTS (',
  'family join must prevent concurrent active membership in another family during invite redemption',
);
assertIncludes(
  familyJoin,
  'FAMILY_JOIN_CONFLICT',
  'family join must surface unresolved invite redemption races explicitly',
);

const restore = read('functions/api/account/restore.ts');
assertIncludes(restore, 'RESTORE_REQUIRES_REAUTH', 'account restore must require re-authentication');
if (restore.includes('requireUser(') || restore.includes('UPDATE users')) {
  console.error('account restore endpoint must not restore a deleted account through a stale session.');
  process.exitCode = 1;
}

for (const file of [
  'functions/api/auth/google/callback.ts',
  'functions/api/auth/apple/callback.ts',
  'functions/api/auth/google.ts',
]) {
  const oauth = read(file);
  assertIncludes(oauth, 'consumeInviteCode(', `${file} must consume beta invites through the shared helper`);
  assertIncludes(oauth, 'SET deleted_at = NULL, deletion_scheduled_at = NULL, is_active = 1', `${file} must restore soft-deleted accounts after re-auth`);
  assertOrder(
    oauth,
    'const requireInvite = String((env as any).REQUIRE_INVITE',
    'SET deleted_at = NULL, deletion_scheduled_at = NULL, is_active = 1',
    `${file} must restore only after invite access checks`,
  );
}

const googleOAuthCallback = read('functions/api/auth/google/callback.ts');
assertIncludes(
  googleOAuthCallback,
  'import { cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signSessionJwt, verifyState } from "../_oauth"',
  'google OAuth callback must use shared OAuth session/state helpers',
);
assertIncludes(
  googleOAuthCallback,
  'await safeResponseJson(tokenRes)',
  'google OAuth callback must tolerate non-JSON token endpoint failures',
);
assertIncludes(
  googleOAuthCallback,
  'await safeResponseJson(infoRes)',
  'google OAuth callback must tolerate non-JSON tokeninfo failures',
);

const googleOAuthStart = read('functions/api/auth/google/start.ts');
assertIncludes(
  googleOAuthStart,
  'import { base64UrlEncode, cookieSerialize, getBaseUrl, normalizeAppUrl, OAUTH_STATE_TTL_MS, signState } from "../_oauth"',
  'google OAuth start must use shared OAuth state helpers',
);

const appleOAuthCallback = read('functions/api/auth/apple/callback.ts');
assertIncludes(
  appleOAuthCallback,
  'await safeResponseJson(tokenRes)',
  'apple OAuth callback must tolerate non-JSON token endpoint failures',
);
assertIncludes(
  appleOAuthCallback,
  'const tokenEmailVerified = idPayload.email_verified === true || idPayload.email_verified === "true";',
  'apple OAuth callback must derive admin eligibility from the verified id_token email flag',
);
assertIncludes(
  appleOAuthCallback,
  'const verifiedTokenEmail = tokenEmailVerified ? tokenEmail : "";',
  'apple OAuth callback must keep untrusted form email out of admin eligibility',
);
assertIncludes(
  appleOAuthCallback,
  'if (adminEmails.length && verifiedTokenEmail && adminEmails.includes(verifiedTokenEmail.toLowerCase()))',
  'apple OAuth callback must only auto-promote admins with verified token email',
);
assertIncludes(
  appleOAuthCallback,
  'if (bootstrapEmails.length && verifiedTokenEmail)',
  'apple OAuth callback must only bootstrap admins with verified token email',
);

const legacyGoogleAuth = read('functions/api/auth/google.ts');
assertIncludes(
  legacyGoogleAuth,
  'import { cookieSerialize, signSessionJwt } from "./_oauth"',
  'legacy Google auth endpoint must use shared OAuth session helpers',
);
assertIncludes(
  legacyGoogleAuth,
  'if (user.email_verified && adminEmails.length && user.email && adminEmails.includes(String(user.email).toLowerCase()))',
  'legacy Google auth endpoint must only auto-promote admins with verified emails',
);
assertIncludes(
  legacyGoogleAuth,
  'await safeResponseJson(r)',
  'legacy Google auth endpoint must tolerate non-JSON tokeninfo responses',
);
assertNotIncludes(
  legacyGoogleAuth,
  'await r.text()',
  'legacy Google auth endpoint must not read unbounded tokeninfo error bodies',
);

const oauthLib = read('functions/api/auth/_oauth.ts');
assertIncludes(
  oauthLib,
  'await safeResponseJson(response)',
  'Apple JWKS loader must tolerate non-JSON key endpoint responses',
);
assertIncludes(
  oauthLib,
  'timingSafeEqualString(expected, stateSig)',
  'OAuth state verification must not compare signatures with direct string equality',
);
assertIncludes(
  oauthLib,
  'if (parts.length !== 2) return null',
  'OAuth state verification must reject structurally invalid state values',
);

const supportAttachments = read('functions/api/_lib/support_attachments.ts');
assertIncludes(
  supportAttachments,
  'messageId?: string',
  'support attachment route builder must support message attachments',
);
assertIncludes(
  supportAttachments,
  'messageId=${encodeURIComponent(messageId)}',
  'support attachment route builder must include messageId in URLs',
);

const supportAttachmentRoute = read('functions/api/support/attachment.ts');
assertIncludes(
  supportAttachmentRoute,
  'const messageId = String(url.searchParams.get("messageId") || "").trim();',
  'support attachment route must parse messageId',
);
assertIncludes(
  supportAttachmentRoute,
  'FROM support_feedback_messages',
  'support attachment route must load message attachments',
);
assertIncludes(
  supportAttachmentRoute,
  'if (!isAdmin && row.user_id !== user.sub) return json({ error: "FORBIDDEN" }, 403);',
  'support attachment route must enforce owner/admin access',
);

const userSupport = read('functions/api/support/feedback/my.ts');
const adminSupport = read('functions/api/support/feedback.ts');
assertIncludes(
  userSupport,
  'attachmentResponseUrl(scope.ticketId, index, scope.messageId)',
  'user support thread must expose URLs for R2 message attachments',
);
assertIncludes(
  userSupport,
  'const writeResults = await db.batch(statements);',
  'user support reply must write message and ticket update through one batch',
);
assertIncludes(
  userSupport,
  'deleteStoredAttachments(env.SUPPORT_ATTACHMENTS, attachments);',
  'user support reply must remove stored R2 attachments when the guarded write fails',
);
assertIncludes(
  userSupport,
  "AND status != 'closed'",
  'user support reply writes must stay conditional on an open ticket',
);
assertIncludes(
  adminSupport,
  'attachmentResponseUrl(scope.ticketId, index, scope.messageId)',
  'admin support thread must expose URLs for R2 message attachments',
);

const accountCleanup = read('functions/api/_lib/account_cleanup.ts');
assertIncludes(
  accountCleanup,
  'Number.isFinite(parsed) ? Math.floor(parsed) : fallback',
  'cleanup limit normalization must reject NaN and infinite limits before querying',
);
assertIncludes(
  accountCleanup,
  'failed: failures.length',
  'cleanup must expose failed hard deletes',
);
assertIncludes(
  accountCleanup,
  'failures: failures.slice(0, 20)',
  'cleanup must expose bounded failure details',
);

const aiLimits = read('functions/api/_lib/ai_limits.ts');
assertIncludes(
  aiLimits,
  'normalizeCleanupBucketLimit(limit)',
  'AI rate-limit bucket cleanup must normalize invalid limits before querying',
);
assertIncludes(
  aiLimits,
  'Number.isFinite(parsed) ? Math.floor(parsed) : fallback',
  'AI rate-limit bucket cleanup must reject NaN and infinite limits before querying',
);
assertIncludes(
  aiLimits,
  'assertDailyLimitAvailable',
  'AI rate controls must precheck exhausted daily limits before mutating rate buckets',
);
assertOrder(
  aiLimits,
  'await assertDailyLimitAvailable',
  'await enforceCooldown',
  'AI rate controls must check exhausted daily quota before cooldown mutation',
);
assertOrder(
  aiLimits,
  'await assertDailyLimitAvailable',
  'await enforceBurst',
  'AI rate controls must check exhausted daily quota before burst mutation',
);

const aiEndpoint = read('functions/api/ai.ts');
assertIncludes(
  aiEndpoint,
  'const ALLOWED_GEMINI_MODELS = new Set',
  'AI endpoint must define an allowlist for client-selected Gemini models',
);
assertIncludes(
  aiEndpoint,
  'const model = resolveGeminiModel(body?.model)',
  'AI endpoint must not pass arbitrary client model names to Gemini',
);
assertIncludes(
  aiEndpoint,
  'const { feature: _drop, model: _model, ...payload } = body ?? {}',
  'AI endpoint must strip server-only feature/model fields from the upstream Gemini payload',
);
assertIncludes(
  aiEndpoint,
  'const geminiTimeoutMs = normalizeGeminiTimeoutMs(env.GEMINI_TIMEOUT_MS)',
  'AI endpoint must normalize Gemini fetch timeout from env',
);
assertIncludes(
  aiEndpoint,
  'signal: controller.signal',
  'AI endpoint must pass an abort signal to the upstream Gemini fetch',
);
assertOrder(
  aiEndpoint,
  'if (!apiKey)',
  'await enforceAiRateControls',
  'AI endpoint must not mutate strict rate-limit buckets when Gemini API key is missing',
);
assertNotIncludes(
  aiEndpoint,
  'function getCookie',
  'AI endpoint must not carry a local cookie parser after requireUser became mandatory',
);
assertNotIncludes(
  aiEndpoint,
  'async function verifySessionJwt',
  'AI endpoint must not carry a local session verifier after requireUser became mandatory',
);
assertNotIncludes(
  aiEndpoint,
  'async function resolveIdentityKey',
  'AI endpoint must not keep a stale IP/session fallback identity path',
);

const plansLib = read('functions/api/_lib/plans.ts');
assertIncludes(
  plansLib,
  'if (!raw) return fallback;',
  'AI daily limit parser must treat blank env values as missing',
);
assertIncludes(
  plansLib,
  'parseNonNegativeFiniteLimit(env.FREE_AI_DAILY_LIMIT, DEFAULT_FREE_AI_DAILY_LIMIT)',
  'free AI daily limit must fall back to a finite default when env config is invalid',
);
assertIncludes(
  plansLib,
  'parseOptionalNonNegativeFiniteLimit(raw, DEFAULT_FREE_AI_DAILY_LIMIT)',
  'paid AI daily limits must not become unlimited when env config is invalid',
);

const adminCleanupDeleted = read('functions/api/admin/cleanup_deleted.ts');
assertIncludes(
  adminCleanupDeleted,
  'normalizeCleanupRequestLimit(body, 50)',
  'admin cleanup endpoint must parse invalid limits with the admin default',
);

const internalCleanupDeleted = read('functions/api/internal/cleanup_deleted.ts');
assertIncludes(
  internalCleanupDeleted,
  'normalizeCleanupRequestLimit(body, 200)',
  'scheduled cleanup endpoint must parse invalid limits with the scheduled default',
);
assertIncludes(
  internalCleanupDeleted,
  'readBearerToken(request.headers.get("Authorization"))',
  'scheduled cleanup endpoint must reuse shared bearer parsing',
);

const accountDeleteLib = read('functions/api/_lib/account_delete.ts');
assertIncludes(
  accountDeleteLib,
  'NOT EXISTS (',
  'soft account delete must guard last-admin removal inside the user update statement',
);
assertIncludes(
  accountDeleteLib,
  'changedRows(updateResult) === 0',
  'soft account delete must reject guarded updates that change no rows',
);
assertIncludes(
  accountDeleteLib,
  'guardHardDeleteAccount',
  'hard account delete must claim the user with a last-admin guard before deleting external objects',
);
assertIncludes(
  accountDeleteLib,
  'await guardHardDeleteAccount(db, userId);',
  'hard account delete must run the guarded user update before support attachment deletion',
);
assertIncludes(
  accountDeleteLib,
  'JOIN users u ON u.id = ur.user_id',
  'hard account delete last-admin precheck must only apply to active admin users',
);

const adminAiLogs = read('functions/api/admin/ai_logs.ts');
assertIncludes(
  adminAiLogs,
  'toInt(url.searchParams.get("limit"), 50)',
  'admin ai logs must parse invalid limit values through a finite fallback',
);
assertIncludes(
  adminAiLogs,
  'return json({ error: "UNAUTH" }, 401);',
  'admin ai logs must return 401 for unauthenticated requests',
);

const adminEventsRoute = read('functions/api/admin/admin_events.ts');
assertIncludes(
  adminEventsRoute,
  'toInt(url.searchParams.get("limit"), 50)',
  'admin events must parse invalid limit values through a finite fallback',
);
assertIncludes(
  adminEventsRoute,
  'toInt(url.searchParams.get("offset"), 0)',
  'admin events must parse invalid offset values through a finite fallback',
);

const adminUserRoles = read('functions/api/admin/user_roles.ts');
assertIncludes(
  adminUserRoles,
  'ALLOWED_ROLE_VALUES',
  'admin user role endpoint must validate known role values',
);
assertIncludes(
  adminUserRoles,
  'ALLOWED_ACTION_VALUES',
  'admin user role endpoint must validate known actions',
);
assertIncludes(
  adminUserRoles,
  'SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
  'admin user role endpoint must verify target user exists and is active',
);
assertIncludes(
  adminUserRoles,
  'SELECT COUNT(*)',
  'admin user role endpoint must guard last-admin removal inside the delete statement',
);
assertIncludes(
  adminUserRoles,
  'changedRows(result) === 0',
  'admin user role endpoint must reject guarded admin removals that change no rows',
);

const adminSessions = read('functions/api/admin/sessions.ts');
assertIncludes(
  adminSessions,
  'SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
  'admin session endpoint must verify target user exists and is active',
);
assertIncludes(
  adminSessions,
  'changedRows(result) === 0',
  'admin session revoke must reject missing session rows',
);
assertIncludes(
  adminSessions,
  'action: "session_revoke"',
  'admin session revoke must write an audit event',
);

const adminSubscription = read('functions/api/admin/subscription.ts');
assertIncludes(
  adminSubscription,
  'SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
  'admin subscription endpoint must verify target user exists and is active',
);
assertIncludes(
  adminSubscription,
  'action: "subscription_update"',
  'admin subscription endpoint must write an audit event',
);
assertIncludes(
  adminSubscription,
  "VALUES (?1, 'free', 'canceled', NULL, NULL, NULL, ?2)",
  'admin subscription endpoint must upsert a free canceled row instead of relying on update-only behavior',
);

const adminInvites = read('functions/api/admin/invites.ts');
assertIncludes(
  adminInvites,
  'toInt(url.searchParams.get("limit"), 100)',
  'admin invite list must parse invalid limit values through a finite fallback',
);
assertIncludes(
  adminInvites,
  'typeof body?.revoked !== "boolean"',
  'admin invite update must require explicit boolean revoked values',
);
assertIncludes(
  adminInvites,
  'changedRows(result) === 0',
  'admin invite update must reject missing invite rows',
);
assertIncludes(
  adminInvites,
  'action: "invite_update"',
  'admin invite update must write an audit event',
);

const adminFeatureFlags = read('functions/api/admin/feature_flags.ts');
assertIncludes(
  adminFeatureFlags,
  'ALLOWED_FEATURE_FLAGS',
  'admin feature flag endpoint must allow only known runtime flags',
);
assertIncludes(
  adminFeatureFlags,
  'typeof body?.enabled !== "boolean"',
  'admin feature flag endpoint must require explicit boolean enabled values',
);
assertIncludes(
  adminFeatureFlags,
  'BAD_ROLLOUT',
  'admin feature flag endpoint must reject invalid rollout values',
);

const adminSettings = read('functions/api/admin/settings.ts');
assertIncludes(
  adminSettings,
  'SETTING_VALIDATORS',
  'admin settings endpoint must allow only known runtime settings',
);
assertIncludes(
  adminSettings,
  'nonNegativeInteger',
  'admin settings endpoint must validate integer limits',
);
assertIncludes(
  adminSettings,
  'limitAction',
  'admin settings endpoint must validate limit action values',
);

const supportFeedback = read('functions/api/support/feedback.ts');
assertIncludes(
  supportFeedback,
  'BAD_STATUS',
  'admin support patch must reject invalid ticket statuses',
);
assertIncludes(
  supportFeedback,
  'BAD_PRIORITY',
  'admin support patch must reject invalid ticket priorities',
);
assertIncludes(
  supportFeedback,
  'BAD_ASSIGN_TO',
  'admin support patch must reject invalid assignment modes',
);
assertIncludes(
  supportFeedback,
  'action: "support_ticket_update"',
  'admin support patch must write an audit event',
);
assertIncludes(
  supportFeedback,
  'const writeResults = await db.batch(statements);',
  'admin support patch must write reply and ticket update through one batch',
);
assertIncludes(
  supportFeedback,
  'changedRows(updateResult) === 0',
  'admin support patch must reject ticket updates that affect no row',
);
assertIncludes(
  supportFeedback,
  'toInt(url.searchParams.get("limit"), 20)',
  'admin support list must parse invalid limit values through a finite fallback',
);
assertOrder(
  supportFeedback,
  'changedRows(updateResult) === 0',
  'action: "support_ticket_update"',
  'admin support patch must only audit successful ticket writes',
);

const billingWebhook = read('functions/api/billing/webhook.ts');
assertIncludes(
  billingWebhook,
  'applyStripeSubscriptionUpdate',
  'billing webhook must process subscription updates through a tested helper',
);
assertIncludes(
  billingWebhook,
  'SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1',
  'billing webhook must verify subscription metadata user exists and is active',
);
assertIncludes(
  billingWebhook,
  'reason: "UNKNOWN_PRICE"',
  'billing webhook must skip active subscriptions with unknown prices',
);
assertIncludes(
  billingWebhook,
  'stripe_subscription_id = ?1',
  'billing webhook must resolve existing subscriptions when Stripe metadata has no user id',
);
assertIncludes(
  billingWebhook,
  'stripe_customer_id = ?2',
  'billing webhook must fall back to customer id when subscription metadata has no user id',
);

const exportRoute = read('functions/api/export.ts');
assertIncludes(
  exportRoute,
  'SELECT kind, bucket_key, feature, window_start_ms, count, updated_at FROM ai_rate_limits',
  'export must query the current ai_rate_limits schema',
);
assertIncludes(
  exportRoute,
  'SELECT achievement_key, unlocked_at, tier, source, snapshot_json, created_at FROM user_achievements',
  'export must query the current user_achievements schema',
);
assertIncludes(
  exportRoute,
  'SELECT code, family_id, expires_at, created_by_user_id, created_at, used_by_user_id, used_at FROM family_invites',
  'export must query the current family_invites schema',
);
assertIncludes(
  exportRoute,
  'SELECT id, title, source_food_name, calories, protein, fat, carbs, ingredients_json, steps_json, allergens_json, created_at FROM recipes',
  'export must query the current recipes schema',
);
for (const legacyNeedle of [
  'SELECT kind, bucket_key, count, reset_at, updated_at FROM ai_rate_limits',
  'SELECT achievement_key, unlocked_at, meta_json FROM user_achievements',
  'SELECT id, title, ingredients_json, steps_json, nutrition_json, tags_json, source, created_at, updated_at FROM recipes',
]) {
  if (exportRoute.includes(legacyNeedle)) {
    console.error(`export route still references legacy schema field: ${legacyNeedle}`);
    process.exitCode = 1;
  }
}

const aiRoute = read('functions/api/ai.ts');
assertIncludes(
  aiRoute,
  'profile?.weight ??',
  'AI fallback must prefer canonical weight profile fields',
);
assertIncludes(
  aiRoute,
  'profile?.targetWeight ??',
  'AI fallback must prefer canonical targetWeight profile fields',
);
assertIncludes(
  aiRoute,
  'profile?.activityLevel ??',
  'AI fallback must prefer canonical activityLevel profile fields',
);

const billingCheckout = read('functions/api/billing/checkout.ts');
assertIncludes(
  billingCheckout,
  'resolveCheckoutPlanPrice',
  'billing checkout must resolve plans through a shared helper',
);
assertIncludes(
  billingCheckout,
  'PRICE_PRO_YEARLY',
  'billing checkout must support yearly pro pricing',
);

const familyMenu = read('functions/api/family/menu.ts');
assertIncludes(
  familyMenu,
  'SELECT id FROM weekly_menus WHERE family_id=? AND week_start=? LIMIT 1',
  'family menu save must check for an existing weekly menu row',
);
assertIncludes(
  familyMenu,
  'UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?',
  'family menu save must update an existing weekly menu row in place',
);
assertIncludes(
  familyMenu,
  'if (!isIsoDay(weekStart)) return json({ error: "BAD_WEEK" }, 400);',
  'family menu routes must reject malformed weekStart values',
);
if (familyMenu.includes('DELETE FROM weekly_menus WHERE family_id = ? AND week_start = ?')) {
  console.error('family menu save must not delete the current weekly menu row before writing a replacement.');
  process.exitCode = 1;
}

const familyMenuGenerate = read('functions/api/family/menu/generate.ts');
assertIncludes(
  familyMenuGenerate,
  'if (!isIsoDay(weekStart)) return json({ error: "BAD_WEEK" }, 400);',
  'family menu generator must reject malformed weekStart values',
);
assertIncludes(
  familyMenuGenerate,
  'await db.batch(statements);',
  'family menu generator must write menu, portions, and shopping items through one batch',
);
assertIncludes(
  familyMenuGenerate,
  'DELETE FROM weekly_menu_items WHERE family_id=? AND week_start=?',
  'family menu generator must clear stale family shopping rows before rebuilding them',
);
if (familyMenuGenerate.includes('UPDATE weekly_menus SET menu_json=?, created_by_user_id=?, created_at=? WHERE id=?') && familyMenuGenerate.includes('.run();')) {
  console.error('family menu generator must not execute the menu update as a separate write before related rows are ready.');
  process.exitCode = 1;
}

const weeklyMenuItems = read('functions/api/weekly_menu/items.ts');
assertIncludes(
  weeklyMenuItems,
  'await db.batch(statements);',
  'weekly menu items save must write through a single batch',
);
assertIncludes(
  weeklyMenuItems,
  'const statements = [',
  'weekly menu items save must stage statements before replacing rows',
);
if (weeklyMenuItems.includes('DELETE FROM weekly_menu_items') && weeklyMenuItems.includes('.run();')) {
  console.error('weekly menu items save must not run delete/insert statements separately.');
  process.exitCode = 1;
}

const shoppingBulk = read('functions/api/shopping/bulk.ts');
assertIncludes(
  shoppingBulk,
  'await db.batch(statements);',
  'shopping bulk updates must write through a single batch',
);
assertIncludes(
  shoppingBulk,
  'const scopeId = getShoppingScopeId(user.sub, family_id);',
  'shopping bulk updates must compute a stable scope id once per request',
);
if (shoppingBulk.includes('INSERT INTO shopping_checked') && shoppingBulk.includes('.run();')) {
  console.error('shopping bulk updates must not execute per-item writes separately.');
  process.exitCode = 1;
}

const stateRoute = read('functions/api/state.ts');
assertIncludes(
  stateRoute,
  'await db.batch(statements);',
  'state put must write kv items through a single batch after validation',
);
assertIncludes(
  stateRoute,
  'const currentByKey = new Map<string, { value: string; version: number }>();',
  'state put must stage current versions before writing',
);
assertIncludes(
  stateRoute,
  'Number.isInteger(parsedBaseVersion)',
  'state put must reject non-integer baseVersion values',
);
assertIncludes(
  stateRoute,
  'BAD_BASE_VERSION',
  'state put must reject invalid baseVersion values instead of bypassing conflict checks',
);
if (stateRoute.includes('INSERT INTO user_kv') && stateRoute.includes('bind(user.sub, it.key, String(it.value ?? ""), t, nextVersion)\n      .run();')) {
  console.error('state put must not execute per-item kv writes before the whole request is conflict-checked.');
  process.exitCode = 1;
}

const profileRoute = read('functions/api/profile.ts');
assertIncludes(
  profileRoute,
  'Number.isInteger(parsedBaseVersion)',
  'profile writes must reject non-integer baseVersion values',
);
assertIncludes(
  profileRoute,
  'BAD_BASE_VERSION',
  'profile writes must reject invalid baseVersion values instead of bypassing conflict checks',
);

const wearableSyncRoute = read('functions/api/wearable/sync.ts');
assertIncludes(
  wearableSyncRoute,
  'Number.isInteger(parsedBaseVersion)',
  'wearable sync must reject non-integer baseVersion values',
);
assertIncludes(
  wearableSyncRoute,
  'BAD_BASE_VERSION',
  'wearable sync must reject invalid baseVersion values instead of bypassing conflict checks',
);

const pushTestRoute = read('functions/api/push/test.ts');
assertIncludes(
  pushTestRoute,
  'const statements: D1PreparedStatement[] = [];',
  'push test route must stage subscription status writes',
);
assertIncludes(
  pushTestRoute,
  'await db.batch(statements);',
  'push test route must write subscription status changes through one batch',
);
if (pushTestRoute.includes('UPDATE push_subscriptions SET last_sent_at') && pushTestRoute.includes('.run();')) {
  console.error('push test route must not execute per-subscription status writes separately.');
  process.exitCode = 1;
}

const familyMember = read('functions/api/family/member.ts');
assertIncludes(
  familyMember,
  'changedRows(result) === 0',
  'family member patch must reject updates that affect no active member row',
);
assertIncludes(
  familyMember,
  'BAD_GOAL',
  'family member patch must validate known goal values',
);
assertIncludes(
  familyMember,
  "AND status = 'active' AND is_active = 1",
  'family member patch must only update active family member rows',
);

const familyInvite = read('functions/api/family/invite.ts');
assertIncludes(
  familyInvite,
  'Number.isFinite(parsedTtlHours) ? parsedTtlHours : 72',
  'family invite TTL parsing must reject NaN before writing expires_at',
);
assertIncludes(
  familyInvite,
  'INSERT OR IGNORE INTO family_invites',
  'family invite creation must tolerate code collisions during insert',
);
assertIncludes(
  familyInvite,
  'INVITE_GENERATION_FAILED',
  'family invite creation must fail explicitly when unique code generation is exhausted',
);

const familyIndex = read('functions/api/family/index.ts');
assertIncludes(
  familyIndex,
  'WHERE NOT EXISTS (',
  'family creation must guard owner membership insertion against concurrent active family membership',
);
assertIncludes(
  familyIndex,
  'DELETE FROM families WHERE id = ?',
  'family creation must clean up orphan family rows when membership insertion loses a race',
);
assertIncludes(
  familyIndex,
  'FAMILY_CREATE_CONFLICT',
  'family creation must surface unresolved creation races explicitly',
);

if (process.exitCode) process.exit();
console.log('API invariants check passed.');
