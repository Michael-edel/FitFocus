-- 0007_ai_cost_intelligence.sql
-- AI Cost Intelligence: token/cost observability + daily rollups

-- 1) Extend ai_events with cost fields
ALTER TABLE ai_events ADD COLUMN model TEXT;
ALTER TABLE ai_events ADD COLUMN input_tokens INTEGER;
ALTER TABLE ai_events ADD COLUMN output_tokens INTEGER;
ALTER TABLE ai_events ADD COLUMN total_tokens INTEGER;
ALTER TABLE ai_events ADD COLUMN estimated_cost_usd REAL;
ALTER TABLE ai_events ADD COLUMN is_fallback INTEGER DEFAULT 0;

-- 2) Daily rollup table (per-user, UTC day)
CREATE TABLE IF NOT EXISTS user_cost_daily (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD (UTC)
  ai_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  fallback_calls INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  p95_latency_ms INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, -- epoch ms
  PRIMARY KEY (user_id, day)
);

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_ai_events_ts ON ai_events(ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_user_ts ON ai_events(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_feature_ts ON ai_events(feature, ts);
CREATE INDEX IF NOT EXISTS idx_user_cost_daily_day ON user_cost_daily(day);
