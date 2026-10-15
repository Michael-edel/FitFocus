import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { parseJson } from '../../safeJson';
import { getAccountScopedUiValue, useAccountScopedUiSetter } from '../state/accountScopedUi';

export type PlanScope = 'personal' | 'family';

export type PlanUiState = {
  planIntroOpen: boolean;
  planRulesExpanded: boolean;
  planScope: PlanScope;
  familyMenuPrefsOpen: boolean;
  planWeekExpanded: Record<string, boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'boolean');
}

function buildWeekExpanded(weekDays: readonly string[], stored: Record<string, boolean>): Record<string, boolean> {
  if (!weekDays.length) return stored;
  return weekDays.reduce<Record<string, boolean>>((result, day, index) => {
    result[day] = typeof stored[day] === 'boolean' ? stored[day] : index < 2;
    return result;
  }, {});
}

export function parsePlanUiState(raw: string | null, weekDays: readonly string[]): PlanUiState {
  const parsed = raw ? parseJson(raw) : null;
  const record = isRecord(parsed) ? parsed : {};
  const storedWeek = isBooleanRecord(record.planWeekExpanded) ? record.planWeekExpanded : {};

  return {
    planIntroOpen: record.planIntroOpen === true,
    planRulesExpanded: record.planRulesExpanded === true,
    planScope: record.planScope === 'family' ? 'family' : 'personal',
    familyMenuPrefsOpen: record.familyMenuPrefsOpen === true,
    planWeekExpanded: buildWeekExpanded(weekDays, storedWeek),
  };
}

/** Keeps persisted plan-screen controls scoped to the active profile. */
export function usePlanUiState({
  userId,
  weekDayKeys,
  planScope,
  setPlanScope,
  familyMenuPrefsOpen,
  setFamilyMenuPrefsOpen,
}: {
  userId: string | null | undefined;
  weekDayKeys: readonly string[];
  planScope: PlanScope;
  setPlanScope: Dispatch<SetStateAction<PlanScope>>;
  familyMenuPrefsOpen: boolean;
  setFamilyMenuPrefsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const storageKey = useMemo(() => `fitfocus.plan.ui.v1:${userId ?? 'anon'}`, [userId]);
  const weekDaySignature = weekDayKeys.join('\u0000');
  const stableWeekDayKeys = useMemo(() => weekDayKeys, [weekDaySignature]);
  const defaultWeekExpanded = useMemo(() => buildWeekExpanded(stableWeekDayKeys, {}), [stableWeekDayKeys]);
  const skipNextSaveRef = useRef(false);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [planIntroOpen, setPlanIntroOpen] = useState(false);
  const [planRulesExpanded, setPlanRulesExpanded] = useState(false);
  const [planWeekExpanded, setPlanWeekExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    skipNextSaveRef.current = true;
    try {
      const next = parsePlanUiState(localStorage.getItem(storageKey), stableWeekDayKeys);
      setPlanIntroOpen(next.planIntroOpen);
      setPlanRulesExpanded(next.planRulesExpanded);
      setPlanScope(next.planScope);
      setFamilyMenuPrefsOpen(next.familyMenuPrefsOpen);
      setPlanWeekExpanded(next.planWeekExpanded);
    } catch {
      setPlanIntroOpen(false);
      setPlanRulesExpanded(false);
      setPlanScope('personal');
      setFamilyMenuPrefsOpen(false);
      setPlanWeekExpanded(buildWeekExpanded(stableWeekDayKeys, {}));
    }
    setHydratedStorageKey(storageKey);
  }, [setFamilyMenuPrefsOpen, setPlanScope, stableWeekDayKeys, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        planIntroOpen,
        planRulesExpanded,
        planScope,
        familyMenuPrefsOpen,
        planWeekExpanded,
      }));
    } catch {
      // Ignore storage quota or privacy errors.
    }
  }, [familyMenuPrefsOpen, hydratedStorageKey, planIntroOpen, planRulesExpanded, planScope, planWeekExpanded, storageKey]);

  const visibleState = getAccountScopedUiValue(storageKey, hydratedStorageKey, {
    planIntroOpen,
    planRulesExpanded,
    planWeekExpanded,
  }, {
    planIntroOpen: false,
    planRulesExpanded: false,
    planWeekExpanded: defaultWeekExpanded,
  });
  const setPlanIntroOpenForScope = useAccountScopedUiSetter(storageKey, setPlanIntroOpen);
  const setPlanRulesExpandedForScope = useAccountScopedUiSetter(storageKey, setPlanRulesExpanded);
  const setPlanWeekExpandedForScope = useAccountScopedUiSetter(storageKey, setPlanWeekExpanded);

  return {
    planIntroOpen: visibleState.planIntroOpen,
    setPlanIntroOpen: setPlanIntroOpenForScope,
    planRulesExpanded: visibleState.planRulesExpanded,
    setPlanRulesExpanded: setPlanRulesExpandedForScope,
    planWeekExpanded: visibleState.planWeekExpanded,
    setPlanWeekExpanded: setPlanWeekExpandedForScope,
  };
}
