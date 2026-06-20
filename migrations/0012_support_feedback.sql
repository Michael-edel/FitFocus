-- 0012_support_feedback.sql
-- Support tickets / feedback form with attachments and admin status tracking.

CREATE TABLE IF NOT EXISTS support_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  category TEXT NOT NULL,
  section TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  steps_json TEXT,
  device TEXT,
  browser TEXT,
  contact TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_created_at ON support_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_support_feedback_user_id ON support_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_support_feedback_status ON support_feedback(status);
