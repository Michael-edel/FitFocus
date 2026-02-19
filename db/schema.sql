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

-- Профиль пользователя (source of truth). Храним целиком JSON, чтобы фронт мог развиваться без миграций.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- История приёмов пищи (опционально, но нужно для экспорта)
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Логи AI (для "магии" + поддержки + экспорта)
CREATE TABLE IF NOT EXISTS ai_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  feature TEXT NOT NULL,
  request_json TEXT,
  response_json TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);