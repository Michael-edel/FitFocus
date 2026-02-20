-- 0003_family_recipes.sql
-- Adds missing family + recipes tables for Family mode + Recipes panel.

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  display_name TEXT,
  restrictions_json TEXT, -- allergens/intolerances/excluded foods (JSON)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(family_id, user_id)
);

CREATE TABLE IF NOT EXISTS family_menus (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  week_start TEXT NOT NULL, -- YYYY-MM-DD (Monday)
  menu_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(family_id, week_start)
);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_food_name TEXT,
  calories REAL,
  protein REAL,
  fat REAL,
  carbs REAL,
  ingredients_json TEXT,
  steps_json TEXT,
  allergens_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_menus_family_week ON family_menus(family_id, week_start);
CREATE INDEX IF NOT EXISTS idx_recipes_user_created ON recipes(user_id, created_at);
