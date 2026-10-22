import { useEffect, useMemo } from 'react';
import type { RegistrationData } from '../../RegistrationScreen';
import { ActivityLevel, Gender, Goal } from '../../types';
import { isRecord, parseJson } from '../../safeJson';
import { useAccountScopedUiState } from '../state/accountScopedUi';

/** The caller supplies an already verified account/session scope; storage never proves login. */
export function registrationDraftStorageKey(scopeKey: string | null): string | null {
  return scopeKey?.trim() && !scopeKey.startsWith('no-session:')
    ? `fitfocus.registration.draft.v1:${encodeURIComponent(scopeKey)}` : null;
}

function draftFields(value: unknown): Partial<RegistrationData> {
  if (!isRecord(value)) return {};
  const fields: Record<string, unknown> = {};
  for (const key of ['name', 'medicalRestrictions'] as const) {
    if (typeof value[key] === 'string') fields[key] = value[key];
  }
  for (const key of ['weight', 'height', 'age', 'targetWeight', 'bloodPressureSystolic',
    'bloodPressureDiastolic', 'restingPulse', 'bloodGlucoseMmolL', 'waistCm', 'chestCm',
    'hipsCm', 'lossDeficit', 'gainSurplus'] as const) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) fields[key] = value[key];
  }
  if (Object.values(Gender).includes(value.gender as Gender)) fields.gender = value.gender;
  if (Object.values(Goal).includes(value.goal as Goal)) fields.goal = value.goal;
  if (typeof value.activityLevel === 'number' && Object.values(ActivityLevel).includes(value.activityLevel)) fields.activityLevel = value.activityLevel;
  if (['free', 'pro', 'family'].includes(value.plan as string)) fields.plan = value.plan;
  if (isRecord(value.dietary)) {
    const dietary: Record<string, unknown> = {};
    for (const key of ['allergens', 'intolerances', 'excludedFoods'] as const) {
      const list = value.dietary[key];
      if (Array.isArray(list) && list.every(item => typeof item === 'string')) dietary[key] = [...list];
    }
    if (value.dietary.severity === 'strict' || value.dietary.severity === 'avoid') dietary.severity = value.dietary.severity;
    if (typeof value.dietary.notes === 'string') dietary.notes = value.dietary.notes;
    fields.dietary = dietary;
  }
  return fields as Partial<RegistrationData>;
}

export function decodeRegistrationDraft(raw: string | null, scopeKey: string | null, fallback: RegistrationData): RegistrationData {
  const parsed = raw ? parseJson(raw) : null;
  const fields = registrationDraftStorageKey(scopeKey) && isRecord(parsed)
    && parsed.version === 1 && parsed.scopeKey === scopeKey ? draftFields(parsed.data) : {};
  return { ...fallback, ...fields, dietary: { ...fallback.dietary, ...fields.dietary }, riskAckLoss: false, riskAckGain: false };
}

export function readRegistrationDraft(scopeKey: string | null, fallback: RegistrationData,
  storage?: Pick<Storage, 'getItem'>): RegistrationData {
  const key = registrationDraftStorageKey(scopeKey);
  try {
    return decodeRegistrationDraft(key ? (storage ?? window.sessionStorage).getItem(key) : null, scopeKey, fallback);
  } catch { return decodeRegistrationDraft(null, scopeKey, fallback); }
}

export function writeRegistrationDraft(scopeKey: string | null, value: RegistrationData,
  storage?: Pick<Storage, 'setItem'>): boolean {
  const key = registrationDraftStorageKey(scopeKey);
  if (!key) return false;
  try {
    (storage ?? window.sessionStorage).setItem(key, JSON.stringify({ version: 1, scopeKey, data: draftFields(value) }));
    return true;
  } catch { return false; }
}

export function useRegistrationDraft(scopeKey: string | null, fallback: RegistrationData) {
  // An initial draft belongs to its scope. Recreated fallback objects must not reset typing.
  const initial = useMemo(() => readRegistrationDraft(scopeKey, fallback), [scopeKey]);
  const draft = useAccountScopedUiState(scopeKey, initial);
  useEffect(() => { writeRegistrationDraft(scopeKey, draft.value); }, [scopeKey, draft.value]);
  useEffect(() => {
    const reconfirm = () => draft.setValue(previous => ({ ...previous, riskAckLoss: false, riskAckGain: false }));
    window.addEventListener('popstate', reconfirm);
    window.addEventListener('hashchange', reconfirm);
    window.addEventListener('pageshow', reconfirm);
    return () => {
      window.removeEventListener('popstate', reconfirm);
      window.removeEventListener('hashchange', reconfirm);
      window.removeEventListener('pageshow', reconfirm);
    };
  }, [draft.setValue]);
  return draft;
}
