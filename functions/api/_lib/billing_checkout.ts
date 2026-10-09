import Stripe from 'stripe';

export type BillingCheckoutEnv = {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  APP_URL: string;
  PRICE_PRO_MONTHLY?: string;
  PRICE_PRO_YEARLY?: string;
  PRICE_FAMILY_MONTHLY?: string;
};

export function resolveCheckoutPlanPrice(
  plan: string,
  env: Pick<BillingCheckoutEnv, 'PRICE_PRO_MONTHLY' | 'PRICE_PRO_YEARLY' | 'PRICE_FAMILY_MONTHLY'>,
) {
  const normalizedPlan = String(plan || '').trim().toLowerCase();
  const priceId = normalizedPlan === 'pro' ? env.PRICE_PRO_MONTHLY
    : normalizedPlan === 'pro_yearly' ? env.PRICE_PRO_YEARLY
      : normalizedPlan === 'family' ? env.PRICE_FAMILY_MONTHLY
        : null;
  return { normalizedPlan, priceId: priceId || null };
}

/** Creates a hosted checkout session after the HTTP layer has authenticated the user. */
export async function createBillingCheckout({
  env,
  userId,
  plan,
}: {
  env: BillingCheckoutEnv;
  userId: string;
  plan: string;
}) {
  const { normalizedPlan, priceId } = resolveCheckoutPlanPrice(plan, env);
  if (!priceId) return { ok: false as const, reason: 'BAD_REQUEST' as const };
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/?billing=success`,
      cancel_url: `${env.APP_URL}/?billing=cancel`,
      subscription_data: { metadata: { ff_uid: userId, ff_plan: normalizedPlan } },
      metadata: { ff_uid: userId, ff_plan: normalizedPlan },
    });
    return { ok: true as const, url: session.url };
  } catch {
    console.error('billing.checkout_failed');
    return { ok: false as const, reason: 'CHECKOUT_FAILED' as const };
  }
}
