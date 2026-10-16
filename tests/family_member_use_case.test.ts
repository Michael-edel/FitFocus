import { describe, expect, it } from 'vitest';
import { parseFamilyMemberPatch } from '../functions/api/_lib/family_member_profile';

describe('family member profile use case', () => {
  it('normalizes an allowed member patch', () => {
    expect(parseFamilyMemberPatch({
      goal: 'loss',
      sex: 'female',
      age: 31.9,
      height_cm: 168,
      weight_kg: 64.5,
      activity: 3,
      dietary: { allergens: ['орехи', 'Орехи'], severity: 'soft' },
    })).toEqual({
      goal: 'LOSS',
      sex: 'FEMALE',
      age: 31,
      heightCm: 168,
      weightKg: 64.5,
      activity: 3,
      restrictionsJson: '{"allergens":["орехи"],"intolerances":[],"excludedFoods":[],"severity":"soft","notes":""}',
    });
  });

  it('rejects invalid values before any database access', () => {
    expect(parseFamilyMemberPatch({ goal: 'gain' })).toEqual({ ok: false, error: 'BAD_GOAL' });
    expect(parseFamilyMemberPatch({ age: 200 })).toEqual({ ok: false, error: 'BAD_AGE' });
    expect(parseFamilyMemberPatch([])).toEqual({ ok: false, error: 'BAD_JSON' });
  });
});
