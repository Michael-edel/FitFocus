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

type AccountSubscription = {
  stripe_subscription_id: string;
  stripe_created: number;
  plan: string;
  status: string;
  current_period_end: number | null;
  revision: string;
};

function isEntitled(status?: string): boolean {
  return status === 'active' || status === 'trialing';
}

function isCurrent(status: string, periodEnd: number | null, now: number): boolean {
  return isEntitled(status) && (periodEnd === null || periodEnd > now);
}

function planForSubscription(status: string, priceId: string | null | undefined, env: SubscriptionPriceEnv) {
  if (!isEntitled(status)) return 'free';
  if (!priceId) return null;
  if (priceId === env.PRICE_PRO_MONTHLY || priceId === env.PRICE_PRO_YEARLY) return 'pro';
  if (priceId === env.PRICE_FAMILY_MONTHLY) return 'family';
  return null;
}

function subscriptionSnapshot(sub: SubscriptionLike, env: SubscriptionPriceEnv) {
  const status = sub.status || 'unknown';
  return {
    status,
    plan: planForSubscription(status, sub.items?.data?.[0]?.price?.id, env),
    customer: sub.customer?.toString() || null,
    periodEnd: sub.current_period_end ? sub.current_period_end * 1000 : null,
    created: sub.created ?? 0,
  };
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
  const { results: accountSubscriptions } = await db.prepare(
    `SELECT stripe_subscription_id, stripe_created, plan, status, current_period_end, revision
     FROM stripe_subscriptions WHERE user_id = ?`,
  ).bind(uid).all<AccountSubscription>();

  const sub = await retrieve(subscriptionId);
  const liveUid = String(sub.metadata?.ff_uid || '').trim();
  if (!stored && liveUid && liveUid !== uid) return { ok: false, reason: 'SUBSCRIPTION_USER_CHANGED' };
  const { status, plan, customer, periodEnd, created } = subscriptionSnapshot(sub, env);
  if (!plan) return { ok: false, reason: "UNKNOWN_PRICE" };
  const now = Date.now();
  // Resolve dates omitted by 0022 before ranking migrated paid subscriptions.
  const legacy = accountSubscriptions.filter(row => row.stripe_subscription_id !== subscriptionId
    && row.stripe_created === 0 && row.plan !== 'free' && isCurrent(row.status, row.current_period_end, now));
  const refreshed = await Promise.all(legacy.map(async row => ({
    id: row.stripe_subscription_id,
    priorRevision: row.revision,
    value: subscriptionSnapshot(await retrieve(row.stripe_subscription_id), env),
  })));
  if (refreshed.some(({ value }) => !value.plan || value.created <= 0)) {
    return { ok: false, reason: 'LEGACY_SUBSCRIPTION_UNRESOLVED' };
  }
  const legacyRevisions = JSON.stringify(Object.fromEntries(refreshed.map(row => [row.id, row.priorRevision])));

  const revision = crypto.randomUUID();
  const snapshot = db.prepare(
    `INSERT INTO stripe_subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id,
       current_period_end, updated_at, stripe_created, revision)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
     FROM users WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL
       AND (?10 IS NULL OR EXISTS (SELECT 1 FROM stripe_subscriptions WHERE stripe_subscription_id = ?5))
       AND NOT EXISTS (
         SELECT 1 FROM json_each(?11) AS baseline
         WHERE NOT EXISTS (
           SELECT 1 FROM stripe_subscriptions
           WHERE stripe_subscription_id = baseline.key AND user_id = ?1 AND revision = baseline.value
         )
       )
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan=?2, status=?3, stripe_customer_id=?4,
       current_period_end=?6, updated_at=?7, stripe_created=?8, revision=?9
     WHERE stripe_subscriptions.user_id = ?1 AND stripe_subscriptions.revision = ?10`,
  ).bind(uid, plan, status, customer, subscriptionId, periodEnd, now, created, revision,
    stored?.revision ?? null, legacyRevisions);

  const related: Array<{
    id: string;
    priorRevision: string | null;
    value: ReturnType<typeof subscriptionSnapshot>;
  }> = [...refreshed];
  if (discover && !isCurrent(status, periodEnd, now)) {
    const previous = await db.prepare('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?')
      .bind(uid).first<{ stripe_subscription_id: string | null }>();
    const refreshedFallback = refreshed.some(({ value }) => isCurrent(value.status, value.periodEnd, now));
    const knownFallback = refreshedFallback || accountSubscriptions.some(row => !legacy.includes(row)
      && row.stripe_subscription_id !== subscriptionId && row.plan !== 'free'
      && isCurrent(row.status, row.current_period_end, now));
    // A pre-migration projection might have discarded older subscriptions.
    if (previous?.stripe_subscription_id === subscriptionId && !knownFallback) {
      for await (const candidate of discover(uid)) {
        if (!candidate.id || candidate.id === subscriptionId || candidate.metadata?.ff_uid !== uid) continue;
        const value = subscriptionSnapshot(candidate, env);
        if (!value.plan || !isCurrent(value.status, value.periodEnd, now)) continue;
        const prior = accountSubscriptions.find(row => row.stripe_subscription_id === candidate.id);
        related.push({ id: candidate.id, priorRevision: prior?.revision ?? null, value });
      }
    }
  }
  const relatedUpdates = related.map(({ id, priorRevision, value }) => db.prepare(
    `INSERT INTO stripe_subscriptions (user_id, plan, status, stripe_customer_id,
       stripe_subscription_id, current_period_end, updated_at, stripe_created, revision)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
     WHERE EXISTS (SELECT 1 FROM stripe_subscriptions WHERE stripe_subscription_id = ?10 AND revision = ?9)
       AND (?11 IS NULL OR EXISTS (SELECT 1 FROM stripe_subscriptions WHERE stripe_subscription_id = ?5))
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan = ?2, status = ?3, stripe_customer_id = ?4,
       current_period_end = ?6, updated_at = ?7, stripe_created = ?8, revision = ?9
     WHERE stripe_subscriptions.user_id = ?1 AND stripe_subscriptions.revision = ?11`,
  ).bind(uid, value.plan, value.status, value.customer, id, value.periodEnd, now, value.created,
    revision, subscriptionId, priorRevision));

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
  const [result] = await db.batch([snapshot, ...relatedUpdates, projection]);
  const meta = result?.meta as { changes?: number } | undefined;
  if (!meta?.changes) return { ok: false, reason: 'CONCURRENT_SUBSCRIPTION_UPDATE' };
  return { ok: true, user_id: uid, plan, status };
}
