-- 0010_add_family_lifecycle.sql
-- Keeps account deletion checks aligned with family lifecycle state.

ALTER TABLE families ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_families_owner_active
ON families(owner_user_id, is_active);
