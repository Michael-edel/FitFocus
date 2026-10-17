-- Personal shopping data is a projection of an accepted profile, not a second client write.
-- Older weekly_menu_items rows remain available for weeks without a canonical projection.
CREATE TABLE IF NOT EXISTS personal_menu_projections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  items_json TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week_start)
);

CREATE TRIGGER profile_personal_menu_insert AFTER INSERT ON user_profiles
WHEN json_valid(NEW.profile_json)
BEGIN
  SELECT CASE WHEN coalesce(json_type(NEW.profile_json, '$.aiPlan.weeklyMenu'), 'null') <> 'null'
    AND NOT coalesce(
      json_type(NEW.profile_json, '$.aiPlan.weeklyMenu') = 'object'
      AND json_type(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart') = 'text'
      AND length(json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart')) = 10
      AND json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND json_type(NEW.profile_json, '$.aiPlan.weeklyMenu.shoppingListItems') = 'array', 0)
    THEN RAISE(ABORT, 'PROFILE_INVALID_WEEKLY_MENU') END;
  INSERT INTO personal_menu_projections (user_id, week_start, items_json, profile_version, updated_at)
    SELECT NEW.user_id, json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart'),
      json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.shoppingListItems'), NEW.version, NEW.updated_at
    WHERE json_type(NEW.profile_json, '$.aiPlan.weeklyMenu.shoppingListItems') = 'array'
    ON CONFLICT(user_id, week_start) DO UPDATE SET items_json = excluded.items_json,
      profile_version = excluded.profile_version, updated_at = excluded.updated_at;
END;

CREATE TRIGGER profile_personal_menu_update AFTER UPDATE OF profile_json, version ON user_profiles
WHEN json_valid(NEW.profile_json)
BEGIN
  SELECT CASE WHEN coalesce(json_type(NEW.profile_json, '$.aiPlan.weeklyMenu'), 'null') <> 'null'
    AND NOT coalesce(
      json_type(NEW.profile_json, '$.aiPlan.weeklyMenu') = 'object'
      AND json_type(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart') = 'text'
      AND length(json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart')) = 10
      AND json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND json_type(NEW.profile_json, '$.aiPlan.weeklyMenu.shoppingListItems') = 'array', 0)
    THEN RAISE(ABORT, 'PROFILE_INVALID_WEEKLY_MENU') END;
  INSERT INTO personal_menu_projections (user_id, week_start, items_json, profile_version, updated_at)
    SELECT NEW.user_id, json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.weekStart'),
      json_extract(NEW.profile_json, '$.aiPlan.weeklyMenu.shoppingListItems'), NEW.version, NEW.updated_at
    WHERE json_type(NEW.profile_json, '$.aiPlan.weeklyMenu.shoppingListItems') = 'array'
    ON CONFLICT(user_id, week_start) DO UPDATE SET items_json = excluded.items_json,
      profile_version = excluded.profile_version, updated_at = excluded.updated_at;
  -- An explicitly removed menu leaves an empty generation; legacy rows cannot resurrect it.
  INSERT INTO personal_menu_projections (user_id, week_start, items_json, profile_version, updated_at)
    SELECT NEW.user_id,
      json_extract(CASE WHEN json_valid(OLD.profile_json) THEN OLD.profile_json ELSE '{}' END, '$.aiPlan.weeklyMenu.weekStart'),
      '[]', NEW.version, NEW.updated_at
    WHERE coalesce(json_type(NEW.profile_json, '$.aiPlan.weeklyMenu'), 'null') = 'null'
      AND json_type(CASE WHEN json_valid(OLD.profile_json) THEN OLD.profile_json ELSE '{}' END, '$.aiPlan.weeklyMenu.weekStart') = 'text'
    ON CONFLICT(user_id, week_start) DO UPDATE SET items_json = excluded.items_json,
      profile_version = excluded.profile_version, updated_at = excluded.updated_at;
END;
