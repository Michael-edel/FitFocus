-- 0008_weekly_menu_items.sql
-- Stores normalized weekly menu ingredients for aggregated shopping list + exports

CREATE TABLE IF NOT EXISTS weekly_menu_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_id TEXT,
  week_start TEXT NOT NULL, -- YYYY-MM-DD (UTC Monday)
  ingredient_name TEXT NOT NULL,
  grams INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_user_week ON weekly_menu_items(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_family_week ON weekly_menu_items(family_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_week ON weekly_menu_items(week_start);
