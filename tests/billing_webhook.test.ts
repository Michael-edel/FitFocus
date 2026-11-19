import { readFileSync, readdirSync } from 'node:fs';
import Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStripeSubscriptionUpdate, onRequestPost } from '../functions/api/billing/webhook';
import { loadActivePlan } from '../functions/api/_lib/plans';
import { sqliteD1 } from './_helpers/sqliteD1';

const prices = {
  PRICE_PRO_MONTHLY: 'price_pro_monthly',
  PRICE_PRO_YEARLY: 'price_pro_yearly',
  PRICE_FAMILY_MONTHLY: 'price_family_monthly',
};
const subscription = (id: string, created = 10, priceId = prices.PRICE_PRO_MONTHLY) => ({
  id, created, customer: `cus-${id}`, status: 'active', metadata: { ff_uid: 'user-1' },
  items: { data: [{ price: { id: priceId } }] },
});

function fixture(schema?: string) {
  const { db, sqlite } = sqliteD1(schema);
  sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 1)').run('user-1');
  const webhookSecret = 'whsec_unit';
  const stripe = new Stripe('sk_test_unit', { apiVersion: '2023-10-16' });
  const post = async (sub: ReturnType<typeof subscription>, type = 'customer.subscription.updated', sign = true) => {
    const body = JSON.stringify({ id: 'evt-test', type, data: { object: sub } });
    const signature = sign ? stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret })
      : 'bad-signature';
    return onRequestPost({
      request: new Request('https://fitfocus.test/api/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature, 'X-Request-ID': 'billing-webhook-test-01' },
        body,
      }),
      env: { DB: db, STRIPE_SECRET_KEY: 'sk_test_unit', STRIPE_WEBHOOK_SECRET: webhookSecret, ...prices },
    });
  };
  const apply = (sub: Parameters<typeof applyStripeSubscriptionUpdate>[1]) =>
    applyStripeSubscriptionUpdate(db, sub, prices, async () => sub);
  return { db, sqlite, post, apply };
}

const migration = '0022_stripe_subscriptions.sql';
const migrations = new URL('../migrations/', import.meta.url);
const readMigration = (name: string) => readFileSync(new URL(name, migrations), 'utf8');

function migratedFixture() {
  const schema = readdirSync(migrations).filter(name => name.endsWith('.sql') && name < migration)
    .sort().map(readMigration).join('\n');
  const test = fixture(schema);
  const pro = subscription('sub-legacy-pro', 10);
  const family = subscription('sub-legacy-family', 20, prices.PRICE_FAMILY_MONTHLY);
  test.sqlite.exec("INSERT INTO users (id, created_at) VALUES ('manual', 1)");
  test.sqlite.prepare(`INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, updated_at)
    VALUES ('user-1', 'family', 'active', ?, ?, 1), ('manual', 'pro', 'active', NULL, NULL, 1)`).run(family.customer, family.id);
  test.sqlite.exec(readMigration(migration));
  return { ...test, pro, family };
}

afterEach(() => vi.unstubAllGlobals());

describe('billing webhook subscription updates', () => {
  it('rejects invalid signatures before fetching Stripe data', async () => {
    const { post } = fixture();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await post(subscription('sub-1'), 'customer.subscription.updated', false);
    expect(response.status).toBe(400);
    expect(response.headers.get('X-Request-ID')).toBe('billing-webhook-test-01');
    expect(await response.text()).toBe('Webhook Error: invalid signature');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads current Stripe state for a signed delayed event about the same subscription', async () => {
    const { db, post } = fixture();
    const previous = subscription('sub-1');
    const active = subscription('sub-1', 10, prices.PRICE_FAMILY_MONTHLY);
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json(active));
    vi.stubGlobal('fetch', fetch);

    expect((await post(previous)).status).toBe(200);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/v1/subscriptions/sub-1');
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
  });

  it('keeps the current paid subscription when an old one is canceled or delivered again as active', async () => {
    const { db, sqlite, apply } = fixture();
    const tracked = subscription('sub-new', 20, prices.PRICE_FAMILY_MONTHLY);
    const old = subscription('sub-old', 10);
    await apply(tracked);

    await expect(apply({ ...old, status: 'canceled' })).resolves.toMatchObject({ ok: true });
    await expect(applyStripeSubscriptionUpdate(db, old, prices, async id => id === old.id ? old : tracked))
      .resolves.toMatchObject({ ok: true });
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
    expect(sqlite.prepare('SELECT stripe_subscription_id FROM subscriptions').get()?.stripe_subscription_id).toBe(tracked.id);
  });

  it('allows a newer active subscription and applies a cancellation of the tracked subscription', async () => {
    const { db, apply } = fixture();
    const previous = subscription('sub-old', 10);
    const next = subscription('sub-new', 20, prices.PRICE_FAMILY_MONTHLY);
    await apply(previous);
    await expect(applyStripeSubscriptionUpdate(db, next, prices, async id => id === previous.id ? previous : next))
      .resolves.toMatchObject({ ok: true, plan: 'family' });
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
    await expect(apply({ ...next, status: 'canceled' })).resolves.toMatchObject({ ok: true, status: 'canceled', plan: 'free' });
    expect(await loadActivePlan(db, 'user-1')).toBe('pro');
    await apply({ ...previous, status: 'canceled' });
    expect(await loadActivePlan(db, 'user-1')).toBe('free');
  });

  it('restores a paid subscription lost from the old single-row projection', async () => {
    const { db, sqlite } = fixture();
    const current = subscription('sub-current', 20, prices.PRICE_FAMILY_MONTHLY);
    const older = subscription('sub-historical', 10);
    sqlite.prepare(`INSERT INTO subscriptions (user_id, plan, status, stripe_subscription_id, updated_at)
      VALUES ('user-1', 'family', 'active', ?, 1)`).run(current.id);
    const canceled = { ...current, status: 'canceled' };
    const result = await applyStripeSubscriptionUpdate(db, canceled, prices, async () => canceled, async function* (userId) {
      expect(userId).toBe('user-1');
      yield older;
      yield { ...older, id: 'sub-unrelated', metadata: { ff_uid: 'other' } };
    });
    expect(result.ok).toBe(true);
    expect(await loadActivePlan(db, 'user-1')).toBe('pro');
    expect(sqlite.prepare(`SELECT count(*) AS count FROM stripe_subscriptions WHERE stripe_subscription_id = 'sub-unrelated'`).get()?.count).toBe(0);
  });

  it('rejects a Stripe result fetched across a concurrent local update', async () => {
    const { db, apply } = fixture();
    const initial = subscription('sub-1');
    await apply(initial);
    const result = await applyStripeSubscriptionUpdate(db, initial, prices, async () => {
      await apply(subscription('sub-1', 10, prices.PRICE_FAMILY_MONTHLY));
      return initial;
    });
    expect(result).toMatchObject({ reason: 'CONCURRENT_SUBSCRIPTION_UPDATE' });
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
  });

  it('keeps the bound account when Stripe metadata still has its previous account ID', async () => {
    const { db, sqlite, apply } = fixture();
    const pro = subscription('sub-pro');
    const family = subscription('sub-family', 20, prices.PRICE_FAMILY_MONTHLY);
    await apply(pro);
    await apply(family);
    sqlite.exec(`INSERT INTO users (id, created_at) VALUES ('migrated-user', 1);
      UPDATE subscriptions SET user_id = 'migrated-user';
      UPDATE stripe_subscriptions SET user_id = 'migrated-user';`);
    await expect(apply({ ...family, status: 'canceled' }))
      .resolves.toMatchObject({ ok: true, user_id: 'migrated-user' });
    expect(await loadActivePlan(db, 'migrated-user')).toBe('pro');
    expect(await loadActivePlan(db, 'user-1')).toBe('free');
  });

  it('asks Stripe to retry when retrieval fails and leaves the current plan in place', async () => {
    const { db, post, apply } = fixture();
    const current = subscription('sub-1', 10, prices.PRICE_FAMILY_MONTHLY);
    await apply(current);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));

    expect((await post({ ...current, status: 'canceled' }, 'customer.subscription.deleted')).status).toBe(503);
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
  });

  it('skips missing or deleted users and active subscriptions with an unknown price', async () => {
    const { apply } = fixture();
    await expect(apply({ ...subscription('sub-1'), metadata: { ff_uid: 'missing' } }))
      .resolves.toMatchObject({ reason: 'USER_NOT_FOUND' });
    await expect(apply(subscription('sub-1', 10, 'price_unknown'))).resolves.toMatchObject({ reason: 'UNKNOWN_PRICE' });
  });

  it('falls back to stored Stripe identifiers when subscription metadata has no user id', async () => {
    const { apply } = fixture();
    const stored = subscription('sub-1');
    await apply(stored);
    await expect(apply({ ...stored, status: 'canceled', metadata: {} }))
      .resolves.toMatchObject({ ok: true, user_id: 'user-1', plan: 'free', status: 'canceled' });
  });
});

describe('Stripe billing after migration 0022', () => {
  it('refreshes migrated Family before ranking a delayed Pro event and retains Pro after cancellation', async () => {
    const { db, sqlite, post, pro, family } = migratedFixture();
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
    let currentFamily = family;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const id = new URL(String(input)).pathname.split('/').at(-1);
      if (id === pro.id) return Response.json(pro);
      if (id === family.id) return Response.json(currentFamily);
      throw new Error('Unexpected Stripe request');
    });
    vi.stubGlobal('fetch', fetch);

    expect((await post(pro)).status).toBe(200);
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/v1/subscriptions/' + pro.id, '/v1/subscriptions/' + family.id,
    ]);
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
    sqlite.exec(readMigration(migration));
    expect(sqlite.prepare('SELECT stripe_created FROM stripe_subscriptions WHERE stripe_subscription_id = ?').get(family.id))
      .toEqual({ stripe_created: family.created });
    expect(sqlite.prepare('SELECT count(*) AS count FROM stripe_subscriptions').get()).toEqual({ count: 2 });
    expect(await loadActivePlan(db, 'manual')).toBe('pro');

    currentFamily = { ...family, status: 'canceled' };
    expect((await post(currentFamily, 'customer.subscription.deleted')).status).toBe(200);
    expect(await loadActivePlan(db, 'user-1')).toBe('pro');
  });

  it('still lets a genuinely newer subscription supersede migrated Family', async () => {
    const { db, pro, family } = migratedFixture();
    const newerPro = { ...pro, created: 30 };
    const result = await applyStripeSubscriptionUpdate(db, newerPro, prices,
      async id => id === family.id ? family : newerPro);
    expect(result.ok).toBe(true);
    expect(await loadActivePlan(db, 'user-1')).toBe('pro');
  });

  it('ranks both undated paid subscriptions after records have moved to one account', async () => {
    const { db, sqlite, pro, family } = migratedFixture();
    const priorFamily = { ...family, id: 'sub-older-family', created: 5 };
    sqlite.prepare(`INSERT INTO stripe_subscriptions
      (stripe_subscription_id, user_id, plan, status, stripe_created, updated_at, revision)
      VALUES (?, 'user-1', 'family', 'active', 0, 1, 'legacy')`).run(priorFamily.id);
    const byId = new Map([pro, priorFamily, family].map(sub => [sub.id, sub]));
    const result = await applyStripeSubscriptionUpdate(db, pro, prices, async id => {
      const sub = byId.get(id);
      if (!sub) throw new Error('Unexpected Stripe request');
      return sub;
    });

    expect(result.ok).toBe(true);
    expect(sqlite.prepare('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?').get('user-1'))
      .toEqual({ stripe_subscription_id: family.id });
    expect(sqlite.prepare('SELECT count(*) AS count FROM stripe_subscriptions WHERE stripe_created = 0').get())
      .toEqual({ count: 0 });
  });

  it('retries instead of applying an event when the migrated creation date cannot be refreshed', async () => {
    const { db, sqlite, post, pro, family } = migratedFixture();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
      Response.json(String(input).endsWith(pro.id) ? pro : { ...family, created: undefined }));

    expect((await post(pro)).status).toBe(503);
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
    expect(sqlite.prepare('SELECT count(*) AS count FROM stripe_subscriptions').get()).toEqual({ count: 1 });
  });

  it('does not overwrite a concurrent refresh of migrated Family', async () => {
    const { db, pro, family } = migratedFixture();
    const result = await applyStripeSubscriptionUpdate(db, pro, prices, async id => {
      if (id === pro.id) return pro;
      await applyStripeSubscriptionUpdate(db, family, prices, async () => family);
      return { ...family, status: 'canceled' };
    });

    expect(result.reason).toBe('CONCURRENT_SUBSCRIPTION_UPDATE');
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
  });

  it('recovers legacy Pro from a later list page across Stripe customers', async () => {
    const { db, sqlite, post, pro, family } = migratedFixture();
    const canceled = { ...family, status: 'canceled' };
    const unrelated = { ...pro, id: 'sub-other', metadata: { ff_uid: 'other' } };
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/subscriptions/' + family.id) return Response.json(canceled);
      if (url.pathname !== '/v1/subscriptions') throw new Error('Unexpected Stripe request');
      const isPro = url.searchParams.get('price') === prices.PRICE_PRO_MONTHLY;
      const after = url.searchParams.get('starting_after');
      const data = isPro ? after === unrelated.id ? [pro] : [unrelated] : [];
      return Response.json({ object: 'list', data, has_more: isPro && !after });
    });
    vi.stubGlobal('fetch', fetch);

    expect((await post(canceled, 'customer.subscription.deleted')).status).toBe(200);
    expect(await loadActivePlan(db, 'user-1')).toBe('pro');
    expect(sqlite.prepare('SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ?').get('user-1'))
      .toEqual({ stripe_subscription_id: pro.id });
    expect(sqlite.prepare('SELECT count(*) AS count FROM stripe_subscriptions WHERE stripe_subscription_id = ?').get(unrelated.id))
      .toEqual({ count: 0 });
  });

  it('keeps Family on a failed list page and settles to Free after a complete empty list', async () => {
    const { db, sqlite, post, pro, family } = migratedFixture();
    const canceled = { ...family, status: 'canceled' };
    let failList = true;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/subscriptions/' + family.id) return Response.json(canceled);
      if (url.pathname !== '/v1/subscriptions') throw new Error('Unexpected Stripe request');
      const price = url.searchParams.get('price');
      if (failList && price === prices.PRICE_PRO_YEARLY) return new Response(null, { status: 503 });
      const data = failList && price === prices.PRICE_PRO_MONTHLY ? [pro] : [];
      return Response.json({ object: 'list', data, has_more: false });
    });

    expect((await post(canceled, 'customer.subscription.deleted')).status).toBe(503);
    expect(await loadActivePlan(db, 'user-1')).toBe('family');
    expect(sqlite.prepare('SELECT status, revision FROM stripe_subscriptions').all())
      .toEqual([{ status: 'active', revision: 'legacy' }]);

    failList = false;
    expect((await post(canceled, 'customer.subscription.deleted')).status).toBe(200);
    expect(await loadActivePlan(db, 'user-1')).toBe('free');
  });
});
