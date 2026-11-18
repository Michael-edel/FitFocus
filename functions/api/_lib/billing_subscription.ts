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
  user_id: string;
  revision: string;
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
    `SELECT user_id FROM (
       SELECT user_id, stripe_subscription_id, updated_at FROM stripe_subscriptions
       WHERE stripe_subscription_id = ?1 OR stripe_customer_id = ?2
       UNION ALL
       SELECT user_id, stripe_subscription_id, updated_at FROM subscriptions
       WHERE stripe_subscription_id = ?1 OR stripe_customer_id = ?2
     )
     ORDER BY CASE WHEN stripe_subscription_id = ?1 THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
  ).bind(subscriptionId, customerId).first<{ user_id: string }>();
  return String(row?.user_id || '').trim();
}

/** Reconciles a verified event with Stripe's current state, even when delivery is out of order. */
export async function applyStripeSubscriptionUpdate(
  db: D1Database,
  eventSubscription: SubscriptionLike,
  env: SubscriptionPriceEnv,
  retrieve: (id: string) => Promise<SubscriptionLike>,
  discover?: (userId: string) => AsyncIterable<SubscriptionLike>,
) {
  const subscriptionId = eventSubscription.id;
  if (!subscriptionId) return { ok: false, reason: 'MISSING_SUBSCRIPTION_ID' };
  // A known Stripe ID keeps its account binding, including after a verified legacy
  // account migration. Checkout metadata can still contain the previous account ID.
  const stored = await db.prepare('SELECT user_id, revision FROM stripe_subscriptions WHERE stripe_subscription_id = ?')
    .bind(subscriptionId).first<StoredSubscription>();
  const uid = stored?.user_id ?? await resolveSubscriptionUserId(db, eventSubscription);
  if (!uid) return { ok: false, reason: 'MISSING_UID' };
  const target = await db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1')
    .bind(uid).first<{ id: string }>();
  if (!target?.id) return { ok: false, reason: 'USER_NOT_FOUND' };
  const sub = await retrieve(subscriptionId);
  const liveUid = String(sub.metadata?.ff_uid || '').trim();
  if (!stored && liveUid && liveUid !== uid) return { ok: false, reason: 'SUBSCRIPTION_USER_CHANGED' };
  const status = String(sub.status || 'unknown');
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const plan = planForSubscription(status, priceId, env);
  if (!plan) return { ok: false, reason: "UNKNOWN_PRICE" };
  const periodEnd = sub.current_period_end ? sub.current_period_end * 1000 : null;
  const now = Date.now();
  const revision = crypto.randomUUID();
  const snapshot = db.prepare(
    `INSERT INTO stripe_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id,
       current_period_end, updated_at, stripe_created, revision)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
     FROM users WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL
       AND (?10 IS NULL OR EXISTS (SELECT 1 FROM stripe_subscriptions WHERE stripe_subscription_id = ?5))
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan=?2, status=?3, stripe_customer_id=?4,
       current_period_end=?6, updated_at=?7, stripe_created=?8, revision=?9
     WHERE stripe_subscriptions.user_id = ?1 AND stripe_subscriptions.revision = ?10`,
  ).bind(uid, plan, status, sub.customer?.toString() || null, subscriptionId, periodEnd, now,
    sub.created ?? 0, revision, stored?.revision ?? null);

  const historical: D1PreparedStatement[] = [];
  if (discover && (!isEntitled(status) || (periodEnd !== null && periodEnd <= now))) {
    const previous = await db.prepare('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?')
      .bind(uid).first<{ stripe_subscription_id: string | null }>();
    const knownFallback = await db.prepare(
      `SELECT 1 FROM stripe_subscriptions WHERE user_id = ? AND stripe_subscription_id != ?
       AND plan != 'free' AND status IN ('active', 'trialing')
       AND (current_period_end IS NULL OR current_period_end > ?) LIMIT 1`,
    ).bind(uid, subscriptionId, now).first();
    // A pre-migration projection might have discarded older subscriptions. Search
    // is only discovery for that gap. A known subscription never depends on it.
    if (previous?.stripe_subscription_id === subscriptionId && !knownFallback) {
      for await (const candidate of discover(uid)) {
        if (!candidate.id || candidate.id === subscriptionId || candidate.metadata?.ff_uid !== uid) continue;
        const candidatePlan = planForSubscription(candidate.status ?? '', candidate.items?.data?.[0]?.price?.id, env);
        const candidateEnd = candidate.current_period_end ? candidate.current_period_end * 1000 : null;
        if (!candidatePlan || candidatePlan === 'free' || (candidateEnd !== null && candidateEnd <= now)) continue;
        historical.push(db.prepare(
          `INSERT OR IGNORE INTO stripe_subscriptions (user_id, plan, status, stripe_customer_id,
             stripe_subscription_id, current_period_end, updated_at, stripe_created, revision)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
           WHERE EXISTS (SELECT 1 FROM stripe_subscriptions WHERE stripe_subscription_id = ?10 AND revision = ?9)`,
        ).bind(uid, candidatePlan, candidate.status, candidate.customer?.toString() || null,
          candidate.id, candidateEnd, now, candidate.created ?? 0, revision, subscriptionId));
      }
    }
  }

  // D1 executes the snapshot and compatibility projection in one transaction. The
  // projection only runs when this event won the revision check.
  const projection = db.prepare(
    `WITH choices AS (
       SELECT *, CASE WHEN plan != 'free' AND status IN ('active', 'trialing')
         AND (current_period_end IS NULL OR current_period_end > ?4) THEN 1 ELSE 0 END AS eligible
       FROM stripe_subscriptions WHERE user_id = ?1
     )
     INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
     SELECT user_id, CASE WHEN eligible = 1 THEN plan ELSE 'free' END, status, stripe_customer_id,
       stripe_subscription_id, current_period_end, ?4
     FROM choices
     WHERE (eligible = 1 OR stripe_subscription_id = ?2)
       AND EXISTS (SELECT 1 FROM stripe_subscriptions WHERE stripe_subscription_id = ?2 AND revision = ?3)
     ORDER BY eligible DESC, stripe_created DESC,
       stripe_subscription_id IS (SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?1) DESC,
       stripe_subscription_id
     LIMIT 1
     ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status,
       stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
       current_period_end = excluded.current_period_end, updated_at = excluded.updated_at
     WHERE subscriptions.stripe_subscription_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM choices WHERE stripe_subscription_id = ?2 AND eligible = 1)`,
  ).bind(uid, subscriptionId, revision, now);
  const [result] = await db.batch([snapshot, ...historical, projection]);
  const meta = result?.meta as { changes?: number } | undefined;
  if (!meta?.changes) return { ok: false, reason: 'CONCURRENT_SUBSCRIPTION_UPDATE' };
  return { ok: true, user_id: uid, plan, status };
}
