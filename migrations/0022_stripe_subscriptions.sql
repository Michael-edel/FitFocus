CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end INTEGER,
  stripe_created INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_user_id ON stripe_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_id ON stripe_subscriptions(stripe_customer_id);

INSERT OR IGNORE INTO stripe_subscriptions (
  stripe_subscription_id, user_id, stripe_customer_id, plan, status,
  current_period_end, stripe_created, updated_at, revision
)
SELECT stripe_subscription_id, user_id, stripe_customer_id, plan, status,
  current_period_end, 0, updated_at, 'legacy'
FROM subscriptions
WHERE stripe_subscription_id IS NOT NULL;
