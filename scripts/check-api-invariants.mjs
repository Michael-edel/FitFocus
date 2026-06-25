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
  'WHERE (SELECT COUNT(*) FROM family_members WHERE family_id = ? AND status =',
  'family join must enforce member limit during insert',
);
assertIncludes(
  familyJoin,
  'UPDATE family_invites SET used_by_user_id = NULL, used_at = NULL',
  'family join must release invite when member insert fails',
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
  adminSupport,
  'attachmentResponseUrl(scope.ticketId, index, scope.messageId)',
  'admin support thread must expose URLs for R2 message attachments',
);

const accountCleanup = read('functions/api/_lib/account_cleanup.ts');
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

const adminInvites = read('functions/api/admin/invites.ts');
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

if (process.exitCode) process.exit();
console.log('API invariants check passed.');
