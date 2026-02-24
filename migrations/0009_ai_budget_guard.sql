-- 0009_ai_budget_guard.sql
-- Budget Guard settings (admin-managed)

CREATE TABLE IF NOT EXISTS feature_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Flags (boolean)
INSERT OR IGNORE INTO feature_flags (key, enabled, rollout_percentage) VALUES
('ai_budget_guard_enabled', 0, 100),
('ai_emergency_fallback', 0, 100);

-- Settings (string/number)
INSERT OR IGNORE INTO feature_settings (key, value) VALUES
('ai_max_calls_per_user_day', '0'),
('ai_max_cost_per_user_day_usd', '0'),
('ai_max_cost_total_day_usd', '0'),
('ai_on_limit_action', 'fallback');
