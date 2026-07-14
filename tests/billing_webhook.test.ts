import { describe, expect, it } from 'vitest';
import { applyStripeSubscriptionUpdate, onRequestPost } from '../functions/api/billing/webhook';

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb(options: { userExists?: boolean; storedUserId?: string } = {}) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    runs,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM subscriptions')) {
            return options.storedUserId ? { user_id: options.storedUserId } : null;
          }
          if (sql.includes('SELECT id FROM users')) {
            return options.userExists === false ? null : { id: this.binds[0] };
          }
          return null;
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };

  return db;
}

const env = {
  PRICE_PRO_MONTHLY: 'price_pro_monthly',
  PRICE_PRO_YEARLY: 'price_pro_yearly',
  PRICE_FAMILY_MONTHLY: 'price_family_monthly',
};

describe('billing webhook subscription updates', () => {
  it('does not expose Stripe signature verification details', async () => {
    const response = await onRequestPost({
      request: new Request('https://fitfocus.test/api/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'bad-signature' },
        body: '{}',
      }),
      env: {
        DB: makeDb() as unknown as D1Database,
        STRIPE_SECRET_KEY: 'sk_test_unit',
        STRIPE_WEBHOOK_SECRET: 'whsec_unit',
        ...env,
      },
    });

    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toBe('Webhook Error: invalid signature');
    expect(text).not.toContain('bad-signature');
    expect(text).not.toContain('No signatures found');
    expect(text).not.toContain('stripe-signature');
  });

  it('updates an active existing user subscription for known prices', async () => {
    const db = makeDb();

    const result = await applyStripeSubscriptionUpdate(db as unknown as D1Database, {
      id: 'sub-1',
      customer: 'cus-1',
      status: 'active',
      current_period_end: 123,
      metadata: { ff_uid: 'user-1' },
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    }, env);

    expect(result).toMatchObject({ ok: true, user_id: 'user-1', plan: 'pro', status: 'active' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO subscriptions') && run.binds[1] === 'pro')).toBe(true);
  });

  it('skips subscription updates for missing or deleted users', async () => {
    const db = makeDb({ userExists: false });

    const result = await applyStripeSubscriptionUpdate(db as unknown as D1Database, {
      id: 'sub-1',
      status: 'active',
      metadata: { ff_uid: 'deleted-user' },
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    }, env);

    expect(result).toEqual({ ok: false, reason: 'USER_NOT_FOUND' });
    expect(db.runs.some((run) => run.sql.includes('subscriptions'))).toBe(false);
  });

  it('skips active subscription updates for unknown prices', async () => {
    const db = makeDb();

    const result = await applyStripeSubscriptionUpdate(db as unknown as D1Database, {
      id: 'sub-1',
      status: 'active',
      metadata: { ff_uid: 'user-1' },
      items: { data: [{ price: { id: 'price_unknown' } }] },
    }, env);

    expect(result).toEqual({ ok: false, reason: 'UNKNOWN_PRICE' });
    expect(db.runs.some((run) => run.sql.includes('subscriptions'))).toBe(false);
  });

  it('records deleted subscriptions as free while preserving Stripe status', async () => {
    const db = makeDb();

    const result = await applyStripeSubscriptionUpdate(db as unknown as D1Database, {
      id: 'sub-1',
      status: 'canceled',
      metadata: { ff_uid: 'user-1' },
      items: { data: [{ price: { id: 'price_unknown' } }] },
    }, env);

    expect(result).toMatchObject({ ok: true, plan: 'free', status: 'canceled' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO subscriptions') && run.binds[1] === 'free')).toBe(true);
  });

  it('falls back to stored Stripe identifiers when webhook metadata has no user id', async () => {
    const db = makeDb({ storedUserId: 'user-1' });

    const result = await applyStripeSubscriptionUpdate(db as unknown as D1Database, {
      id: 'sub-1',
      customer: 'cus-1',
      status: 'canceled',
      items: { data: [{ price: { id: 'price_unknown' } }] },
    }, env);

    expect(result).toMatchObject({ ok: true, user_id: 'user-1', plan: 'free', status: 'canceled' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO subscriptions') && run.binds[0] === 'user-1')).toBe(true);
  });
});
