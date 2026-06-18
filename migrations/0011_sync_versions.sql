-- 0011_sync_versions.sql
-- Add optimistic concurrency metadata for cloud sync.

ALTER TABLE user_profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_kv ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
