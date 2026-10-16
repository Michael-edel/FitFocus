import { useEffect, useRef, useState } from 'react';
import { parseJson } from '../../safeJson';
import { safeSetItem } from '../../storage/hybrid';

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'boolean');
}

export function parsePlanTaskState(raw: string | null): Record<string, boolean> {
  const parsed = raw ? parseJson(raw) : null;
  return isBooleanRecord(parsed) ? parsed : {};
}

function storageKey(userId: string) {
  return `fitfocus_data_${userId}_plan_task_done`;
}

/** Stores completed plan tasks only after the active profile has been hydrated. */
export function usePlanTaskState(userId: string | null | undefined) {
  const [planTaskDone, setPlanTaskDone] = useState<Record<string, boolean>>({});
  const hydratedUserIdRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      hydratedUserIdRef.current = null;
      skipNextSaveRef.current = true;
      setPlanTaskDone({});
      return;
    }
    if (hydratedUserIdRef.current === userId) return;

    try {
      const next = parsePlanTaskState(localStorage.getItem(storageKey(userId)));
      hydratedUserIdRef.current = userId;
      skipNextSaveRef.current = true;
      setPlanTaskDone(next);
      safeSetItem(storageKey(userId), JSON.stringify(next));
    } catch {
      hydratedUserIdRef.current = userId;
      skipNextSaveRef.current = true;
      setPlanTaskDone({});
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hydratedUserIdRef.current !== userId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    safeSetItem(storageKey(userId), JSON.stringify(planTaskDone));
  }, [planTaskDone, userId]);

  return { planTaskDone, setPlanTaskDone };
}
