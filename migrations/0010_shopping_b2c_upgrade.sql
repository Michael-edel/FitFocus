-- 0010_shopping_b2c_upgrade.sql
-- B2C shopping list upgrade: categories + checked state

-- Add optional category to weekly menu items
ALTER TABLE weekly_menu_items ADD COLUMN category TEXT;

-- Track checked items in shopping list (per user/week/[family])
CREATE TABLE IF NOT EXISTS shopping_checked (
  user_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  family_id TEXT,
  ingredient_name TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week_start, family_id, ingredient_name)
);

CREATE INDEX IF NOT EXISTS idx_shopping_checked_user_week ON shopping_checked(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_shopping_checked_family_week ON shopping_checked(family_id, week_start);
