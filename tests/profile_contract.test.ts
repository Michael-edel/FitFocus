import { describe, expect, it } from 'vitest';
import { normalizeProfileRecord } from '../functions/api/_lib/profile_contract';

describe('profile contract', () => {
  it('keeps feature-owned fields while normalizing critical values', () => {
    expect(normalizeProfileRecord({
      weight: '72', wearableEnabled: 1, wearableStepsToday: -1,
      name: '  Анна  ', futureFeature: { enabled: true },
    })).toEqual({
      weight: 72, wearableEnabled: true, name: 'Анна', futureFeature: { enabled: true },
    });
  });
});
