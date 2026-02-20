-- 0005_admin_bootstrap_audit.sql
-- B2C Production hardening:
-- 1) prevent duplicate roles
-- 2) admin audit log table
-- 3) helpful indexes

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_user_role
ON user_roles(user_id, role);

CREATE TABLE IF NOT EXISTS admin_events (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,              -- epoch ms
  action TEXT NOT NULL,            -- e.g. role_add, role_remove, cleanup_deleted, flag_update
  target_user_id TEXT,             -- optional
  meta_json TEXT                   -- optional JSON
);

CREATE INDEX IF NOT EXISTS idx_admin_events_ts ON admin_events(ts);
CREATE INDEX IF NOT EXISTS idx_admin_events_admin ON admin_events(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_events_action ON admin_events(action);
