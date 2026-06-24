CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  tier TEXT NOT NULL,
  source TEXT,
  snapshot_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
ON user_achievements(user_id, unlocked_at DESC);
