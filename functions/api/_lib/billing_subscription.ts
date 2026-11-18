export type SubscriptionLike = {
  id?: string;
  created?: number;
  status?: string;
  customer?: { toString(): string } | string | null;
  current_period_end?: number | null;
  metadata?: { ff_uid?: string | null } | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null }> } | null;
};

type SubscriptionPriceEnv = {
  PRICE_PRO_MONTHLY?: string;
  PRICE_PRO_YEARLY?: string;
  PRICE_FAMILY_MONTHLY?: string;
};

type StoredSubscription = {
  stripe_subscription_id: string | null;
  updated_at: number;
};

function isEntitled(status?: string): boolean {
  return status === 'active' || status === 'trialing';
}

function planForSubscription(status: string, priceId: string | null | undefined, env: SubscriptionPriceEnv) {
  if (!isEntitled(status)) return 'free';
  if (!priceId) return null;
  if (priceId === env.PRICE_PRO_MONTHLY || priceId === env.PRICE_PRO_YEARLY) return 'pro';
  if (priceId === env.PRICE_FAMILY_MONTHLY) return 'family';
  return null;
}

async function resolveSubscriptionUserId(db: D1Database, sub: SubscriptionLike): Promise<string> {
  const metadataUid = String(sub.metadata?.ff_uid || '').trim();
  if (metadataUid) return metadataUid;
  const subscriptionId = sub.id?.toString() || null;
  const customerId = sub.customer?.toString() || null;
  if (!subscriptionId && !customerId) return '';
  const row = await db.prepare(
    `SELECT user_id
     FROM subscriptions
     WHERE (?1 IS NOT NULL AND stripe_subscription_id = ?1)
        OR (?2 IS NOT NULL AND stripe_customer_id = ?2)
     ORDER BY updated_at DESC
     LIMIT 1`,
  ).bind(subscriptionId, customerId).first<{ user_id: string }>();
  return String(row?.user_id || '').trim();
}

/** Reconciles a verified event with Stripe's current state, even when delivery is out of order. */
export async function applyStripeSubscriptionUpdate(
  db: D1Database,
  eventSubscription: SubscriptionLike,
  env: SubscriptionPriceEnv,
  retrieve: (id: string) => Promise<SubscriptionLike>,
) {
  const subscriptionId = eventSubscription.id;
  if (!subscriptionId) return { ok: false, reason: 'MISSING_SUBSCRIPTION_ID' };
  const uid = await resolveSubscriptionUserId(db, eventSubscription);
  if (!uid) return { ok: false, reason: 'MISSING_UID' };
  const target = await db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1')
    .bind(uid).first<{ id: string }>();
  if (!target?.id) return { ok: false, reason: 'USER_NOT_FOUND' };
  // Read the local revision before querying Stripe so a delayed response cannot overwrite a concurrent write.
  const stored = await db.prepare('SELECT stripe_subscription_id, updated_at FROM subscriptions WHERE user_id = ?')
    .bind(uid).first<StoredSubscription>();
  const sub = await retrieve(subscriptionId);
  const liveUid = String(sub.metadata?.ff_uid || '').trim();
  if (liveUid && liveUid !== uid) return { ok: false, reason: 'SUBSCRIPTION_USER_CHANGED' };
  const status = String(sub.status || 'unknown');
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const plan = planForSubscription(status, priceId, env);
  if (!plan) return { ok: false, reason: "UNKNOWN_PRICE" };
  if (stored && stored.stripe_subscription_id !== subscriptionId) {
    if (plan === 'free') return { ok: false, reason: 'OTHER_SUBSCRIPTION' };
    if (stored.stripe_subscription_id) {
      const tracked = await retrieve(stored.stripe_subscription_id);
      if (isEntitled(tracked.status) && (tracked.current_period_end == null || tracked.current_period_end * 1000 > Date.now())
          && (tracked.created ?? 0) >= (sub.created ?? 0)) {
        return { ok: false, reason: 'OTHER_SUBSCRIPTION' };
      }
    }
  }
  const periodEnd = sub.current_period_end ? sub.current_period_end * 1000 : null;
  const now = Math.max(Date.now(), (stored?.updated_at ?? 0) + 1);
  const result = await db.prepare(
    `INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
     FROM users WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL
       AND (?8 IS NULL OR EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ?1))
     ON CONFLICT(user_id) DO UPDATE SET plan=?2, status=?3, stripe_customer_id=?4, stripe_subscription_id=?5, current_period_end=?6, updated_at=?7
     WHERE subscriptions.updated_at = ?8 AND subscriptions.stripe_subscription_id IS ?9`,
  ).bind(uid, plan, status, sub.customer?.toString() || null, subscriptionId, periodEnd, now,
    stored?.updated_at ?? null, stored?.stripe_subscription_id ?? null).run();
  const meta = result.meta as { changes?: number } | undefined;
  if (!meta?.changes) return { ok: false, reason: 'CONCURRENT_SUBSCRIPTION_UPDATE' };
  return { ok: true, user_id: uid, plan, status };
}
