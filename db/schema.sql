-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  -- B2C lifecycle
  deleted_at TEXT,
  deletion_scheduled_at TEXT,
  is_active INTEGER DEFAULT 1
);

-- Подписки/планы
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL, -- 'free' | 'pro' | 'family'
  status TEXT NOT NULL, -- 'active' | 'trialing' | 'past_due' | 'canceled'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end INTEGER,
  updated_at INTEGER NOT NULL
);

-- Лимиты / usage
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD
  feature TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, feature)
);
-- Профиль пользователя (сервер = источник правды)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- KV-хранилище пользовательского состояния (дневник, история, карточки и т.п.)
CREATE TABLE IF NOT EXISTS user_kv (
  user_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, k)
);


-- Сессии (enterprise layer: отзыв, выход со всех устройств)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER DEFAULT 0,
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Web Push subscriptions (per device / browser)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  content_encoding TEXT NOT NULL DEFAULT 'aes128gcm',
  device_label TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  last_error TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled ON push_subscriptions(enabled);


-- Роли пользователей (RBAC)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Флаги функций (feature flags)
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  rollout_percentage INTEGER DEFAULT 100
);

-- Дефолтные фичи (глобально)
INSERT OR IGNORE INTO feature_flags (key, enabled, rollout_percentage) VALUES
('ai_council', 1, 100),
  ('weekly_menu_v2', 1, 100),
  ('family_mode', 1, 100),
  ('ai_safe_mode', 0, 100),
  ('ai_fallback_mode', 1, 100),
  ('ai_budget_guard_enabled', 0, 100),
  ('ai_emergency_fallback', 0, 100);

-- Настройки AI budget guard / admin settings
CREATE TABLE IF NOT EXISTS feature_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO feature_settings (key, value) VALUES
('ai_max_calls_per_user_day', '0'),
('ai_max_cost_per_user_day_usd', '0'),
('ai_max_cost_total_day_usd', '0'),
('ai_on_limit_action', 'fallback');




-- AI события (логирование для мониторинга и поддержки)
CREATE TABLE IF NOT EXISTS ai_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,              -- epoch ms
  feature TEXT NOT NULL,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  safe_mode INTEGER DEFAULT 0,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd REAL,
  is_fallback INTEGER DEFAULT 0,
  request_json TEXT,
  response_json TEXT,
  error TEXT
);

-- Daily AI rollup
CREATE TABLE IF NOT EXISTS user_cost_daily (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD (UTC)
  ai_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  fallback_calls INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  p95_latency_ms INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_events_ts ON ai_events(ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_user_ts ON ai_events(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_feature_ts ON ai_events(feature, ts);
CREATE INDEX IF NOT EXISTS idx_user_cost_daily_day ON user_cost_daily(day);

-- Invite codes (закрытая beta)
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  note TEXT,
  max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0,
  expires_at INTEGER,
  revoked INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_created_at ON invite_codes(created_at);



-- Invite redemptions (audit)
CREATE TABLE IF NOT EXISTS invite_redemptions (
  code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  PRIMARY KEY (code, user_id)
);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_user ON invite_redemptions(user_id);

-- 0003_family_recipes.sql
-- Adds missing family + recipes tables for Family mode + Recipes panel.

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT,
  display_name TEXT,
  restrictions_json TEXT, -- allergens/intolerances/excluded foods (JSON)
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER,
  sex TEXT,
  age INTEGER,
  height_cm INTEGER,
  weight_kg REAL,
  activity REAL,
  goal TEXT,
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
CREATE INDEX IF NOT EXISTS idx_families_owner_active ON families(owner_user_id, is_active);

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

-- Shared weekly menus and shopping list helpers
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

CREATE TABLE IF NOT EXISTS weekly_menu_portions (
  weekly_menu_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  portions_json TEXT NOT NULL,
  totals_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (weekly_menu_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_portions_menu ON weekly_menu_portions(weekly_menu_id);

CREATE TABLE IF NOT EXISTS weekly_menu_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_id TEXT,
  week_start TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  grams INTEGER NOT NULL,
  category TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_user_week ON weekly_menu_items(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_family_week ON weekly_menu_items(family_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_menu_items_week ON weekly_menu_items(week_start);

CREATE TABLE IF NOT EXISTS shopping_checked (
  scope_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  family_id TEXT,
  ingredient_name TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_id, week_start, ingredient_name)
);

CREATE INDEX IF NOT EXISTS idx_shopping_checked_scope_week ON shopping_checked(scope_id, week_start);
CREATE INDEX IF NOT EXISTS idx_shopping_checked_family_week ON shopping_checked(family_id, week_start);



CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_user_role
ON user_roles(user_id, role);

CREATE TABLE IF NOT EXISTS admin_events (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,              -- epoch ms
  action TEXT NOT NULL,            -- e.g. role_add, role_remove, cleanup_deleted, flag_update
  target_user_id TEXT,             -- optional
  meta_json TEXT                   -- optional JSON
);

CREATE INDEX IF NOT EXISTS idx_admin_events_ts ON admin_events(ts);
CREATE INDEX IF NOT EXISTS idx_admin_events_admin ON admin_events(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_events_action ON admin_events(action);
CREATE INDEX IF NOT EXISTS idx_admin_events_target ON admin_events(target_user_id);


CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_sessions_session ON admin_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_last_seen ON admin_sessions(last_seen_at);

CREATE TABLE IF NOT EXISTS support_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  category TEXT NOT NULL,
  section TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  steps_json TEXT,
  device TEXT,
  browser TEXT,
  contact TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT,
  admin_note TEXT,
  assigned_admin_user_id TEXT,
  resolved_at INTEGER,
  closed_at INTEGER,
  last_reply_at INTEGER,
  last_reply_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_created_at ON support_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_support_feedback_user_id ON support_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_support_feedback_status ON support_feedback(status);
CREATE INDEX IF NOT EXISTS idx_support_feedback_assigned_admin ON support_feedback(assigned_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_support_feedback_last_reply_at ON support_feedback(last_reply_at);

CREATE TABLE IF NOT EXISTS support_feedback_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  author_role TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachments_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_messages_ticket
ON support_feedback_messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  kind TEXT NOT NULL,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_kind ON ai_rate_limits(user_id, kind, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_updated_at ON ai_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  tier TEXT NOT NULL,
  source TEXT,
  snapshot_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
ON user_achievements(user_id, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS wearable_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_type TEXT,
  scope TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  status TEXT NOT NULL DEFAULT 'connected',
  metadata_json TEXT,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_provider
ON wearable_connections(user_id, provider);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_status
ON wearable_connections(status, updated_at);


-- 0020_personal_menu_projections.sql
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

-- 0021_family_menu_generations.sql
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

-- Dining profiles are private; accepted menu snapshots remain the shared source.
ALTER TABLE families ADD COLUMN dining_roster_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE families ADD COLUMN planning_format_version INTEGER NOT NULL DEFAULT 0 CHECK(planning_format_version IN (0,1));
ALTER TABLE family_menu_generations ADD COLUMN legacy_menu_json TEXT;
CREATE TABLE IF NOT EXISTS family_dining_profiles (
  family_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('account','managed')),
  user_id TEXT,
  display_name TEXT NOT NULL,
  profile_json TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(family_id,id),
  CHECK((kind='account' AND user_id IS NOT NULL AND id=user_id) OR
        (kind='managed' AND user_id IS NULL AND substr(id,1,8)='managed:'))
);
CREATE INDEX IF NOT EXISTS idx_family_dining_active ON family_dining_profiles(family_id,active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_dining_account ON family_dining_profiles(family_id,user_id) WHERE kind='account';

INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,created_at,updated_at)
SELECT m.family_id,m.user_id,'account',m.user_id,
 COALESCE(NULLIF(trim(m.display_name),''),NULLIF(trim(u.name),''),'Участник'),NULL,m.created_at*1000,COALESCE(m.updated_at,m.created_at)*1000
FROM family_members m JOIN families f ON f.id=m.family_id LEFT JOIN users u ON u.id=m.user_id
WHERE f.is_active=1 AND m.is_active=1 AND m.status='active';
UPDATE families SET dining_roster_version=(SELECT count(*) FROM family_dining_profiles p WHERE p.family_id=families.id);
-- Refuse inconsistent historical capacity instead of dropping data.
CREATE TABLE family_planning_capacity_check(n INTEGER CHECK(n<=5));
INSERT INTO family_planning_capacity_check SELECT count(*) FROM family_dining_profiles WHERE active=1 GROUP BY family_id;
DROP TABLE family_planning_capacity_check;

CREATE TRIGGER family_dining_capacity_insert BEFORE INSERT ON family_dining_profiles WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM family_dining_profiles WHERE family_id=NEW.family_id AND active=1)>=5 THEN RAISE(ABORT,'FAMILY_LIMIT') END;
END;
CREATE TRIGGER family_dining_capacity_update BEFORE UPDATE OF active ON family_dining_profiles WHEN NEW.active=1 AND OLD.active=0 BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM family_dining_profiles WHERE family_id=NEW.family_id AND active=1)>=5 THEN RAISE(ABORT,'FAMILY_LIMIT') END;
END;
CREATE TRIGGER family_dining_identity BEFORE UPDATE ON family_dining_profiles WHEN
 NEW.family_id!=OLD.family_id OR NEW.id!=OLD.id OR NEW.kind!=OLD.kind OR NEW.user_id IS NOT OLD.user_id BEGIN
 SELECT RAISE(ABORT,'BAD_PROFILE');
END;
CREATE TRIGGER family_dining_roster_insert AFTER INSERT ON family_dining_profiles BEGIN
 UPDATE families SET dining_roster_version=dining_roster_version+1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_dining_roster_update AFTER UPDATE ON family_dining_profiles BEGIN
 UPDATE families SET dining_roster_version=dining_roster_version+1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_dining_roster_delete AFTER DELETE ON family_dining_profiles BEGIN
 UPDATE families SET dining_roster_version=dining_roster_version+1 WHERE id=OLD.family_id;
END;
CREATE TRIGGER family_roster_overflow BEFORE UPDATE OF dining_roster_version ON families WHEN NEW.dining_roster_version>9007199254740991 BEGIN
 SELECT RAISE(ABORT,'VERSION_EXHAUSTED');
END;
CREATE TRIGGER family_members_active_insert BEFORE INSERT ON family_members WHEN NEW.is_active=1 AND NEW.status='active' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND is_active=1)
 OR EXISTS(SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.user_id=NEW.user_id AND m.is_active=1 AND m.status='active' AND f.is_active=1)
 THEN RAISE(ABORT,'FAMILY_JOIN_CONFLICT') END;
END;
CREATE TRIGGER family_members_active_update BEFORE UPDATE OF is_active,status ON family_members WHEN NEW.is_active=1 AND NEW.status='active' AND (OLD.is_active!=1 OR OLD.status IS NOT 'active') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND is_active=1)
 OR EXISTS(SELECT 1 FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.user_id=NEW.user_id AND m.id!=NEW.id AND m.is_active=1 AND m.status='active' AND f.is_active=1)
 THEN RAISE(ABORT,'FAMILY_JOIN_CONFLICT') END;
END;
CREATE TRIGGER family_members_dining_insert AFTER INSERT ON family_members WHEN NEW.is_active=1 AND NEW.status='active' BEGIN
 INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,created_at,updated_at)
 VALUES(NEW.family_id,NEW.user_id,'account',NEW.user_id,COALESCE(NULLIF(trim(NEW.display_name),''),(SELECT NULLIF(trim(name),'') FROM users WHERE id=NEW.user_id),'Участник'),NULL,NEW.created_at*1000,NEW.created_at*1000)
 ON CONFLICT(family_id,id) DO UPDATE SET active=1,version=version+1,updated_at=excluded.updated_at;
END;
CREATE TRIGGER family_members_dining_update AFTER UPDATE OF is_active,status ON family_members WHEN NEW.is_active!=OLD.is_active OR NEW.status IS NOT OLD.status BEGIN
 INSERT INTO family_dining_profiles(family_id,id,kind,user_id,display_name,profile_json,active,created_at,updated_at)
 SELECT NEW.family_id,NEW.user_id,'account',NEW.user_id,COALESCE(NULLIF(trim(NEW.display_name),''),(SELECT NULLIF(trim(name),'') FROM users WHERE id=NEW.user_id),'Участник'),NULL,1,NEW.created_at*1000,COALESCE(NEW.updated_at,NEW.created_at)*1000
 WHERE NEW.is_active=1 AND NEW.status='active'
 ON CONFLICT(family_id,id) DO UPDATE SET active=1,version=version+1,updated_at=excluded.updated_at;
 UPDATE family_dining_profiles SET active=0,version=version+1 WHERE family_id=NEW.family_id AND id=NEW.user_id AND active=1 AND (NEW.is_active!=1 OR NEW.status IS NOT 'active');
END;
CREATE TRIGGER family_members_dining_delete AFTER DELETE ON family_members BEGIN
 UPDATE family_dining_profiles SET active=0,version=version+1 WHERE family_id=OLD.family_id AND id=OLD.user_id AND active=1;
END;
CREATE TRIGGER family_members_identity BEFORE UPDATE OF family_id,user_id ON family_members WHEN NEW.family_id!=OLD.family_id OR NEW.user_id!=OLD.user_id BEGIN
 SELECT RAISE(ABORT,'FAMILY_JOIN_CONFLICT');
END;
CREATE TRIGGER family_planning_plain_insert BEFORE INSERT ON family_menu_generations WHEN
 COALESCE(json_extract(CASE WHEN json_valid(NEW.menu_json) THEN NEW.menu_json ELSE '{}' END,'$.planningV1.schemaVersion'),0)!=1
 AND EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND planning_format_version=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_plain_update BEFORE UPDATE OF menu_json ON family_menu_generations WHEN
 COALESCE(json_extract(CASE WHEN json_valid(NEW.menu_json) THEN NEW.menu_json ELSE '{}' END,'$.planningV1.schemaVersion'),0)!=1
 AND (EXISTS(SELECT 1 FROM families WHERE id=NEW.family_id AND planning_format_version=1)
 OR json_extract(CASE WHEN json_valid(OLD.menu_json) THEN OLD.menu_json ELSE '{}' END,'$.planningV1.schemaVersion')=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_date_insert BEFORE INSERT ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_type(NEW.menu_json,'$.planningV1') IS NOT NULL BEGIN
 SELECT CASE WHEN json_extract(NEW.menu_json,'$.planningV1.schemaVersion') IS NOT 1 OR json_extract(NEW.menu_json,'$.planningV1.date') IS NOT NEW.week_start OR json_extract(NEW.menu_json,'$.weekStart') IS NOT NEW.week_start THEN RAISE(ABORT,'BAD_MENU') END;
END;
CREATE TRIGGER family_planning_date_update BEFORE UPDATE ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_type(NEW.menu_json,'$.planningV1') IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.family_id!=OLD.family_id OR NEW.week_start!=OLD.week_start OR json_extract(NEW.menu_json,'$.planningV1.schemaVersion') IS NOT 1 OR json_extract(NEW.menu_json,'$.planningV1.date') IS NOT NEW.week_start OR json_extract(NEW.menu_json,'$.weekStart') IS NOT NEW.week_start THEN RAISE(ABORT,'BAD_MENU') END;
END;
CREATE TRIGGER family_planning_archive_update BEFORE UPDATE ON family_menu_generations WHEN
 (OLD.legacy_menu_json IS NOT NULL AND NEW.legacy_menu_json IS NOT OLD.legacy_menu_json)
 OR (OLD.legacy_menu_json IS NULL AND NEW.legacy_menu_json IS NOT NULL AND NEW.legacy_menu_json IS NOT OLD.menu_json) BEGIN
 SELECT RAISE(ABORT,'FAMILY_ARCHIVE_IMMUTABLE');
END;
CREATE TRIGGER family_planning_marker_insert AFTER INSERT ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_extract(NEW.menu_json,'$.planningV1.schemaVersion')=1 BEGIN
 UPDATE families SET planning_format_version=1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_planning_marker_update AFTER UPDATE OF menu_json ON family_menu_generations WHEN json_valid(NEW.menu_json) AND json_extract(NEW.menu_json,'$.planningV1.schemaVersion')=1 BEGIN
 UPDATE families SET planning_format_version=1 WHERE id=NEW.family_id;
END;
CREATE TRIGGER family_planning_marker_persistent BEFORE UPDATE OF planning_format_version ON families WHEN OLD.planning_format_version=1 AND NEW.planning_format_version!=1 BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_delete_guard BEFORE DELETE ON family_menu_generations WHEN
 EXISTS(SELECT 1 FROM families f JOIN users u ON u.id=f.owner_user_id WHERE f.id=OLD.family_id AND f.is_active=1 AND u.is_active=1 AND u.deleted_at IS NULL)
 AND json_valid(OLD.menu_json) AND json_extract(OLD.menu_json,'$.planningV1.schemaVersion')=1 BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_checks_insert BEFORE INSERT ON shopping_checked WHEN
 EXISTS(SELECT 1 FROM family_menu_generations g WHERE (g.family_id=NEW.family_id OR 'family:'||g.family_id=NEW.scope_id) AND g.week_start=NEW.week_start AND json_valid(g.menu_json) AND json_extract(g.menu_json,'$.planningV1.schemaVersion')=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
CREATE TRIGGER family_planning_checks_update BEFORE UPDATE ON shopping_checked WHEN
 EXISTS(SELECT 1 FROM family_menu_generations g WHERE (g.family_id=NEW.family_id OR 'family:'||g.family_id=NEW.scope_id OR g.family_id=OLD.family_id OR 'family:'||g.family_id=OLD.scope_id) AND (g.week_start=NEW.week_start OR g.week_start=OLD.week_start) AND json_valid(g.menu_json) AND json_extract(g.menu_json,'$.planningV1.schemaVersion')=1) BEGIN
 SELECT RAISE(ABORT,'FAMILY_PLANNING_STATE_REQUIRED');
END;
