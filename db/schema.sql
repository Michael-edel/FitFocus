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

-- Профиль пользователя (премиум персонализация для AI)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  gender TEXT,
  age INTEGER,
  height INTEGER,
  weight REAL,
  target_weight REAL,
  activity_level REAL,
  goal TEXT,
  exclusions TEXT,
  loss_deficit INTEGER,
  gain_surplus INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
