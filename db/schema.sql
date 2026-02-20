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
  updated_at INTEGER NOT NULL
);

-- KV-хранилище пользовательского состояния (дневник, история, карточки и т.п.)
CREATE TABLE IF NOT EXISTS user_kv (
  user_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
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
  ('ai_fallback_mode', 1, 100);




-- AI события (логирование для мониторинга и поддержки)
CREATE TABLE IF NOT EXISTS ai_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,              -- epoch ms
  feature TEXT NOT NULL,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  safe_mode INTEGER DEFAULT 0,
  request_json TEXT,
  response_json TEXT,
  error TEXT
);

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
CREATE INDEX IF NOT EXISTS idx_ai_events_user_ts ON ai_events(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_ai_events_feature_ts ON ai_events(feature, ts);



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
