import { describe, expect, it } from 'vitest';
import { applyStripeSubscriptionUpdate } from '../functions/api/billing/webhook';

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb(options: { userExists?: boolean } = {}) {
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
  it('updates an active existing user subscription for known prices', async () => {
    const db = makeDb();

    const result = await applyStripeSubscriptionUpdate(db as any, {
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

    const result = await applyStripeSubscriptionUpdate(db as any, {
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

    const result = await applyStripeSubscriptionUpdate(db as any, {
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

    const result = await applyStripeSubscriptionUpdate(db as any, {
      id: 'sub-1',
      status: 'canceled',
      metadata: { ff_uid: 'user-1' },
      items: { data: [{ price: { id: 'price_unknown' } }] },
    }, env);

    expect(result).toMatchObject({ ok: true, plan: 'free', status: 'canceled' });
    expect(db.runs.some((run) => run.sql.includes('INSERT INTO subscriptions') && run.binds[1] === 'free')).toBe(true);
  });
});
