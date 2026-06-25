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

const familyJoin = read('functions/api/family/join.ts');
const wrangler = read('wrangler.toml');
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
assertIncludes(
  wrangler,
  'binding = "SUPPORT_ATTACHMENTS"',
  'wrangler.toml must bind support attachments R2 bucket',
);
assertIncludes(
  wrangler,
  'bucket_name = "fitfocus-support-attachments"',
  'wrangler.toml must name the support attachments R2 bucket',
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

if (process.exitCode) process.exit();
console.log('API invariants check passed.');
