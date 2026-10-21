-- One accepted generation owns the menu, portions and structured purchases.
-- Preserve legacy snapshots verbatim; unreadable data must not fall back to stale items.
CREATE TABLE IF NOT EXISTS family_menu_generations (
  family_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  menu_json TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (family_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_family_menu_generations_author
  ON family_menu_generations(created_by_user_id);

INSERT INTO family_menu_generations
  (family_id, week_start, version, menu_json, created_by_user_id, updated_at)
SELECT family_id, week_start, 1, menu_json, created_by_user_id, created_at * 1000
FROM weekly_menus WHERE 1
ON CONFLICT(family_id, week_start) DO NOTHING;

-- Old deployments must not accept family writes behind the canonical generation.
-- Deletion stays available for account cleanup; personal item writes stay valid.
CREATE TRIGGER IF NOT EXISTS family_menu_legacy_insert_block
BEFORE INSERT ON weekly_menus BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MENU_STATE_REQUIRED');
END;
CREATE TRIGGER IF NOT EXISTS family_menu_legacy_update_block
BEFORE UPDATE ON weekly_menus BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MENU_STATE_REQUIRED');
END;
CREATE TRIGGER IF NOT EXISTS family_items_legacy_insert_block
BEFORE INSERT ON weekly_menu_items WHEN NEW.family_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MENU_STATE_REQUIRED');
END;
CREATE TRIGGER IF NOT EXISTS family_items_legacy_update_block
BEFORE UPDATE ON weekly_menu_items WHEN NEW.family_id IS NOT NULL OR OLD.family_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'FAMILY_MENU_STATE_REQUIRED');
END;
