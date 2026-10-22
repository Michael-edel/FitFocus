import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as postCheckout } from '../functions/api/billing/checkout';
import { resolveCheckoutPlanPrice } from '../functions/api/_lib/billing_checkout';
import { stateSessionId } from '../functions/api/_lib/state_session';

const { createCheckoutSession } = vi.hoisted(() => ({ createCheckoutSession: vi.fn() }));
vi.mock('stripe', () => ({ default: class StripeMock {
  checkout = { sessions: { create: createCheckoutSession } };
  constructor(_secret: string, _options: unknown) {}
} }));

const SECRET = 'billing-session-test-secret';
const USER_ID = 'billing-user-1';
const SESSION_ID = 'billing-sid-1';
const NOW = Math.floor(Date.now() / 1000);

function b64url(input: string | Uint8Array | ArrayBuffer) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input)
    : input instanceof Uint8Array ? input : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signedSession() {
  const data = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    sub: USER_ID, sid: SESSION_ID, exp: NOW + 3600, email_verified: true,
  }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(signature)}`;
}

function db() {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values = args; return statement; },
        async first() {
          if (sql.includes('FROM sessions')) return { id: SESSION_ID, revoked: 0, expires_at: NOW + 3600 };
          if (sql.includes('FROM users')) return { is_active: 1, deleted_at: null };
          return null;
        },
        async all() {
          if (sql.includes('FROM user_roles WHERE user_id = ?')) return { results: [{ role: 'user' }] };
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: values.length ? 1 : 0 } }; },
      };
      return statement;
    },
  };
}

async function checkoutContext(options: { account?: string; session?: string; includeScope?: boolean; body?: string } = {}) {
  const account = options.account ?? USER_ID;
  const scopeSession = options.session ?? await stateSessionId({ sub: USER_ID, sid: SESSION_ID });
  const token = await signedSession();
  const request = new Request('https://fitfocus.test/api/billing/checkout', {
    method: 'POST',
    headers: {
      Cookie: `ff_session=${token}`,
      'Content-Type': 'application/json',
      ...(options.includeScope === false ? {} : {
        'X-FitFocus-State-Account': account,
        'X-FitFocus-State-Session': scopeSession,
      }),
      'X-Request-ID': 'billing-checkout-test-01',
    },
    body: options.body ?? JSON.stringify({ plan: 'pro' }),
  });
  return { request, env: {
    AUTH_JWT_SECRET: SECRET,
    DB: db() as unknown as D1Database,
    STRIPE_SECRET_KEY: 'sk_test_unit',
    APP_URL: 'https://fitfocus.test',
    PRICE_PRO_MONTHLY: 'price_pro_monthly',
  } } satisfies Parameters<typeof postCheckout>[0];
}

beforeEach(() => {
  createCheckoutSession.mockReset();
  createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/test-session' });
});

describe('billing checkout plan resolution', () => {
  const env = {
    PRICE_PRO_MONTHLY: 'price_pro_monthly',
    PRICE_PRO_YEARLY: 'price_pro_yearly',
    PRICE_FAMILY_MONTHLY: 'price_family_monthly',
  };

  it('maps pro monthly to the monthly price id', () => {
    expect(resolveCheckoutPlanPrice('pro', env)).toEqual({
      normalizedPlan: 'pro',
      priceId: 'price_pro_monthly',
    });
  });

  it('maps pro yearly to the yearly price id', () => {
    expect(resolveCheckoutPlanPrice('pro_yearly', env)).toEqual({
      normalizedPlan: 'pro_yearly',
      priceId: 'price_pro_yearly',
    });
  });

  it('rejects unknown plans', () => {
    expect(resolveCheckoutPlanPrice('enterprise', env)).toEqual({
      normalizedPlan: 'enterprise',
      priceId: null,
    });
  });

  it('creates checkout only after the request scope matches the authenticated session', async () => {
    const context = await checkoutContext({ account: 'another-account' });
    const response = await postCheckout(context);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'UNAUTH' });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('returns a no-store response marked with the captured account and session', async () => {
    const context = await checkoutContext();
    const response = await postCheckout(context);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-FitFocus-Billing-Protocol')).toBe('1');
    expect(response.headers.get('X-FitFocus-Billing-Guard')).toBe('1');
    expect(response.headers.get('X-FitFocus-State-Account')).toBe(USER_ID);
    expect(response.headers.get('X-FitFocus-State-Session')).toBe(await stateSessionId({ sub: USER_ID, sid: SESSION_ID }));
    expect(createCheckoutSession).toHaveBeenCalledOnce();
  });

  it('rejects an unscoped legacy request before parsing the body or creating a checkout', async () => {
    const context = await checkoutContext({ includeScope: false, body: '{' });
    const response = await postCheckout(context);

    expect(response.status).toBe(401);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});
