-- 0017_support_feedback_lifecycle.sql
-- Adds support ticket lifecycle metadata and threaded replies.

ALTER TABLE support_feedback ADD COLUMN assigned_admin_user_id TEXT;
ALTER TABLE support_feedback ADD COLUMN resolved_at INTEGER;
ALTER TABLE support_feedback ADD COLUMN closed_at INTEGER;
ALTER TABLE support_feedback ADD COLUMN last_reply_at INTEGER;
ALTER TABLE support_feedback ADD COLUMN last_reply_by TEXT;

CREATE INDEX IF NOT EXISTS idx_support_feedback_assigned_admin
ON support_feedback(assigned_admin_user_id);

CREATE INDEX IF NOT EXISTS idx_support_feedback_last_reply_at
ON support_feedback(last_reply_at);

CREATE TABLE IF NOT EXISTS support_feedback_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  author_role TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_messages_ticket
ON support_feedback_messages(ticket_id, created_at);
