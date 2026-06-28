CREATE TABLE IF NOT EXISTS wearable_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_type TEXT,
  scope TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  status TEXT NOT NULL DEFAULT 'connected',
  metadata_json TEXT,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_provider
ON wearable_connections(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_status
ON wearable_connections(status, updated_at);
