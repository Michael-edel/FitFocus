-- Preserve each state key's generation across delete/recreate. Existing rows remain live.
ALTER TABLE user_kv ADD COLUMN deleted_at INTEGER;
