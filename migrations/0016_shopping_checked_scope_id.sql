-- 0016_shopping_checked_scope_id.sql
-- Replace nullable family-based key semantics with explicit non-null scope_id.

CREATE TABLE IF NOT EXISTS shopping_checked_v2 (
  scope_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  family_id TEXT,
  ingredient_name TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, week_start, ingredient_name)
);

INSERT OR REPLACE INTO shopping_checked_v2 (
  scope_id,
  week_start,
  family_id,
  ingredient_name,
  checked,
  updated_at
)
SELECT
  resolved_scope_id,
  week_start,
  MAX(family_id) AS family_id,
  ingredient_name,
  MAX(checked) AS checked,
  MAX(updated_at) AS updated_at
FROM (
  SELECT
    CASE
      WHEN family_id IS NOT NULL AND TRIM(family_id) <> '' THEN 'family:' || family_id
      WHEN user_id LIKE 'family:%' OR user_id LIKE 'personal:%' THEN user_id
      ELSE 'personal:' || user_id
    END AS resolved_scope_id,
    week_start,
    family_id,
    ingredient_name,
    checked,
    updated_at
  FROM shopping_checked
)
GROUP BY resolved_scope_id, week_start, ingredient_name;

DROP TABLE shopping_checked;
ALTER TABLE shopping_checked_v2 RENAME TO shopping_checked;

CREATE INDEX IF NOT EXISTS idx_shopping_checked_scope_week
ON shopping_checked(scope_id, week_start);

CREATE INDEX IF NOT EXISTS idx_shopping_checked_family_week
ON shopping_checked(family_id, week_start);
