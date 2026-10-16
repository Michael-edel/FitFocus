import { describe, expect, it } from 'vitest';
import { recordDashboardWeight } from '../features/dashboard/weightLogging';

const profile = { id: 'user-1', name: 'User', weight: 80 };

describe('dashboard weight logging', () => {
  it('records a contract-valid weight and accepts comma decimals', () => {
    const result = recordDashboardWeight(profile as never, '81,5');
    expect(result).toMatchObject({ kind: 'recorded', weight: 81.5, profile: { weight: 81.5 } });
  });

  it('rejects missing, non-finite and out-of-range values before profile persistence', () => {
    for (const value of ['', 'NaN', '19.9', '500.1']) expect(recordDashboardWeight(profile as never, value)).toEqual({ kind: 'invalid' });
  });
});