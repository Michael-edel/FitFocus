import { describe, expect, it } from 'vitest';
import { normalizeProfileRecord } from '../functions/api/_lib/profile_contract';
import { withProtectedFields } from '../functions/api/_lib/legacy_sync';

describe('profile contract', () => {
  it('keeps feature-owned fields while normalizing critical values', () => {
    expect(normalizeProfileRecord({
      weight: '72', wearableEnabled: 1, wearableStepsToday: -1,
      name: '  Анна  ', futureFeature: { enabled: true },
    })).toEqual({
      weight: 72, wearableEnabled: true, name: 'Анна', futureFeature: { enabled: true },
    });
  });

  it('keeps server identity while normalizing a migrated legacy profile', () => {
    const profile = withProtectedFields(
      { sub: 'user-1', email: 'user@example.com' },
      normalizeProfileRecord({ weight: '70', wearableStepsToday: 999_999, version: 2 }),
    );

    expect(profile).toMatchObject({ id: 'user-1', googleSub: 'user-1', weight: 70, version: 2 });
    expect(profile).not.toHaveProperty('wearableStepsToday');
  });
});
