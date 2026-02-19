-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at INTEGER NOT NULL
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
  ('family_mode', 1, 100);

