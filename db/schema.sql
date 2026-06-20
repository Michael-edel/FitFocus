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
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_feedback_created_at ON support_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_support_feedback_user_id ON support_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_support_feedback_status ON support_feedback(status);
