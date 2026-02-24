-- 0010_family_mode_b2c.sql
-- B2C hardening for Family mode:
-- - add missing invites + weekly_menus + weekly_menu_portions tables
-- - make family_members compatible with API fields (status, goal, etc.)
-- Safe for existing installs (ADD COLUMN statements will fail if columns already exist; run once).

CREATE TABLE IF NOT EXISTS family_invites (
  code TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_family_invites_family ON family_invites(family_id);
CREATE INDEX IF NOT EXISTS idx_family_invites_expires ON family_invites(expires_at);

-- Shared weekly menu for a family
CREATE TABLE IF NOT EXISTS weekly_menus (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  week_start TEXT NOT NULL, -- YYYY-MM-DD (UTC Monday)
  menu_json TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(family_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_menus_family_week ON weekly_menus(family_id, week_start);

-- Per-member computed portions & totals (JSON)
CREATE TABLE IF NOT EXISTS weekly_menu_portions (
  id TEXT PRIMARY KEY,
  weekly_menu_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  portions_json TEXT NOT NULL,
  totals_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(weekly_menu_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_portions_menu ON weekly_menu_portions(weekly_menu_id);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_portions_user ON weekly_menu_portions(user_id);

-- family_members: add fields used by API (nullable)
ALTER TABLE family_members ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE family_members ADD COLUMN sex TEXT;         -- 'MALE'|'FEMALE'
ALTER TABLE family_members ADD COLUMN age INTEGER;
ALTER TABLE family_members ADD COLUMN height_cm INTEGER;
ALTER TABLE family_members ADD COLUMN weight_kg REAL;
ALTER TABLE family_members ADD COLUMN activity REAL;    -- ActivityLevel numeric
ALTER TABLE family_members ADD COLUMN goal TEXT;        -- 'LOSS'|'MAINTAIN'
ALTER TABLE family_members ADD COLUMN updated_at INTEGER;
