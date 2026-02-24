-- 0006_admin_v2_hardening.sql
-- Admin v2 hardening: admin_sessions table + helpful indexes (idempotent)

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,                 -- session id (sid)
  admin_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,          -- epoch ms
  last_seen_at INTEGER NOT NULL         -- epoch ms
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_sessions_session ON admin_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_last_seen ON admin_sessions(last_seen_at);

-- Admin events filters performance
CREATE INDEX IF NOT EXISTS idx_admin_events_target ON admin_events(target_user_id);
