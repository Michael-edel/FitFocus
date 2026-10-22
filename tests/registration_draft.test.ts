import { describe, expect, it, vi } from 'vitest';
import { decodeRegistrationDraft, readRegistrationDraft, registrationDraftStorageKey, writeRegistrationDraft } from '../features/auth/useRegistrationDraft';
import { ActivityLevel, Gender, Goal } from '../types';
import type { RegistrationData } from '../RegistrationScreen';

const fallback: RegistrationData = {
  name: '', gender: Gender.MALE, weight: 70, height: 170, age: 30,
  activityLevel: ActivityLevel.SEDENTARY, goal: Goal.MAINTAIN, targetWeight: 70,
  dietary: { allergens: [], intolerances: [], excludedFoods: [], severity: 'avoid', notes: '' },
  medicalRestrictions: '', bloodPressureSystolic: 0, bloodPressureDiastolic: 0,
  restingPulse: 0, bloodGlucoseMmolL: 0, waistCm: 0, chestCm: 0, hipsCm: 0, plan: 'free',
};
const scope = 'verified-owner:epoch-one:session-one';

describe('registration draft', () => {
  it('never reads or writes without an explicit verified scope', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    for (const key of [null, '', ' ', 'no-session:owner']) {
      expect(registrationDraftStorageKey(key)).toBeNull();
      expect(readRegistrationDraft(key, fallback, storage)).toMatchObject({ name: '', riskAckLoss: false });
      expect(writeRegistrationDraft(key, fallback, storage)).toBe(false);
    }
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('round trips unsaved fields in one session without clamping invalid finite input', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const draft = { ...fallback, name: 'Draft', age: 999, gender: Gender.FEMALE,
      goal: Goal.LOSS, activityLevel: ActivityLevel.LIGHTLY_ACTIVE, plan: 'family' as const,
      lossDeficit: -5, dietary: { ...fallback.dietary, allergens: ['nuts'], notes: 'draft notes' },
      riskAckLoss: true, riskAckGain: true };
    expect(writeRegistrationDraft(scope, draft, storage)).toBe(true);
    expect(readRegistrationDraft(scope, fallback, storage)).toEqual({ ...draft, riskAckLoss: false, riskAckGain: false });
    const saved = JSON.parse(data.get(registrationDraftStorageKey(scope)!)!);
    expect(saved.data).not.toHaveProperty('riskAckLoss');
    expect(saved.data).not.toHaveProperty('riskAckGain');
  });

  it('does not restore another account, session, or copied envelope', () => {
    const raw = JSON.stringify({ version: 1, scopeKey: scope, data: { name: 'private draft' } });
    for (const next of ['other-owner:epoch-one:session-one', 'verified-owner:epoch-two:session-two', null]) {
      expect(decodeRegistrationDraft(raw, next, fallback).name).toBe('');
    }
    const getItem = vi.fn(() => null);
    readRegistrationDraft('other-owner:epoch-one:session-one', fallback, { getItem });
    expect(getItem).toHaveBeenCalledWith(registrationDraftStorageKey('other-owner:epoch-one:session-one'));
    expect(getItem).not.toHaveBeenCalledWith(registrationDraftStorageKey(scope));
  });

  it('allowlists fields and rejects invalid types, enum names and nonfinite numbers', () => {
    const raw = JSON.stringify({ version: 1, scopeKey: scope, data: {
      name: 'valid', age: '999', weight: null, gender: 'OTHER', goal: 'UNKNOWN', activityLevel: 'SEDENTARY', plan: 'admin',
      email: 'not-proof@example.test', accountId: 'not-proof', riskAckLoss: true,
      dietary: { allergens: ['nuts', 4], intolerances: ['milk'], severity: 'unsafe', notes: 9, hidden: 'ignore' },
    } });
    const result = decodeRegistrationDraft(raw, scope, fallback);
    expect(result).toEqual({ ...fallback, name: 'valid', dietary: { ...fallback.dietary, intolerances: ['milk'] }, riskAckLoss: false, riskAckGain: false });
    const setItem = vi.fn();
    writeRegistrationDraft(scope, { ...fallback, age: Infinity, email: 'hidden' } as RegistrationData, { setItem });
    const saved = JSON.parse(setItem.mock.calls[0][1]).data;
    expect(saved).not.toHaveProperty('age');
    expect(saved).not.toHaveProperty('email');
  });

  it('fails closed for malformed storage and old formats, requiring risk acknowledgement again', () => {
    for (const raw of ['{', 'null', '[]', '{"version":2}', JSON.stringify({ version: 1, scopeKey: scope, data: null })]) {
      expect(decodeRegistrationDraft(raw, scope, { ...fallback, riskAckLoss: true })).toEqual({ ...fallback, riskAckLoss: false, riskAckGain: false });
    }
  });

  it('does not block the form if storage access or quota fails', () => {
    expect(readRegistrationDraft(scope, fallback, { getItem: () => { throw new Error('disabled'); } })).toMatchObject({ name: '', age: 30 });
    expect(writeRegistrationDraft(scope, fallback, { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
});
