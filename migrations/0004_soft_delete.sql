-- 0004_soft_delete.sql
-- Adds B2C-safe account lifecycle fields (soft delete + scheduled deletion)

ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN deletion_scheduled_at TEXT;
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;

-- Optional: keep families for audit; (no schema change required for soft delete)
