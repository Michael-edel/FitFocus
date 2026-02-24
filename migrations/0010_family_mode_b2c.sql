-- 0010_family_mode_b2c.sql
-- Align Family mode schema with API usage (status/goal fields + invites + weekly menus + portions)

-- Add API-expected columns to family_members (if missing)
ALTER TABLE family_members ADD COLUMN status TEXT;
ALTER TABLE family_members ADD COLUMN updated_at INTEGER;
ALTER TABLE family_members ADD COLUMN sex TEXT;
ALTER TABLE family_members ADD COLUMN age INTEGER;
ALTER TABLE family_members ADD COLUMN height_cm INTEGER;
ALTER TABLE family_members ADD COLUMN weight_kg REAL;
ALTER TABLE family_members ADD COLUMN activity REAL;
ALTER TABLE family_members ADD COLUMN goal TEXT;

-- Backfill status for existing rows using legacy is_active
UPDATE family_members
SET status = CASE
  WHEN status IS NOT NULL AND TRIM(status) != '' THEN status
  WHEN is_active = 1 THEN 'active'
  ELSE 'inactive'
END;

-- Invites table used by /api/family/invite and /api/family/join
CREATE TABLE IF NOT EXISTS family_invites (
  code TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by_user_id TEXT,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_family_invites_family ON family_invites(family_id);

-- Shared weekly menus used by /api/family/menu and /api/family/menu/generate
CREATE TABLE IF NOT EXISTS weekly_menus (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  menu_json TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(family_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_weekly_menus_family_week ON weekly_menus(family_id, week_start);

-- Per-member portions + totals (JSON)
CREATE TABLE IF NOT EXISTS weekly_menu_portions (
  weekly_menu_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  portions_json TEXT NOT NULL,
  totals_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (weekly_menu_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_portions_menu ON weekly_menu_portions(weekly_menu_id);
