import { buildAdminEventStatement } from './admin_audit';

export function normalizePlan(value: unknown): 'free' | 'pro' | 'family' | null {
  const plan = String(value || '').trim().toLowerCase();
  return plan === 'free' || plan === 'pro' || plan === 'family' ? plan : null;
}

export async function updateAdminSubscription(input: { db: D1Database; userId: string; plan: 'free' | 'pro' | 'family'; adminUserId: string; now?: () => number }) {
  const db = input.db;
  const target = await input.db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1').bind(input.userId).first<{ id: string }>();
  if (!target?.id) return null;
  const now = (input.now || Date.now)();
  const subscriptionStatement = input.plan === 'free'
    ? input.db.prepare(`INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
       VALUES (?1, 'free', 'canceled', NULL, NULL, NULL, ?2)
       ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status, stripe_customer_id = NULL, stripe_subscription_id = NULL, current_period_end = NULL, updated_at = excluded.updated_at`).bind(input.userId, now)
    : input.db.prepare(`INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
       VALUES (?1, ?2, 'active', NULL, NULL, NULL, ?3)
       ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status, stripe_customer_id = NULL, stripe_subscription_id = NULL, current_period_end = NULL, updated_at = excluded.updated_at`).bind(input.userId, input.plan, now);
  const auditStatement = buildAdminEventStatement(input.db, { adminUserId: input.adminUserId, action: "subscription_update", targetUserId: input.userId, meta: { plan: input.plan } });
  await db.batch([subscriptionStatement, auditStatement]);
  return { ok: true, user_id: input.userId, plan: input.plan };
}
