import { describe, expect, it } from 'vitest';
import { resolveCheckoutPlanPrice } from '../functions/api/billing/checkout';

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
});
