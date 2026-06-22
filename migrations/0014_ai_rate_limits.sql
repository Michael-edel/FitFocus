-- Strong backend AI rate limits.
-- KV remains useful for cache/dedup, but strict limits must live in D1.
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  kind TEXT NOT NULL,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_kind ON ai_rate_limits(user_id, kind, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_updated_at ON ai_rate_limits(updated_at);
