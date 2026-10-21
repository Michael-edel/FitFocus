import { useEffect, useState } from 'react';
import { getLastAiAction, readAiStatus, type AiLastStatus } from '../../geminiService';

type AiLastAction = ReturnType<typeof getLastAiAction>;

type AiActivity = {
  aiStatus: AiLastStatus | null;
  lastAiAction: AiLastAction;
};

type AccountScope = string | null | undefined;
type ScopedActivity = { accountId: AccountScope; activity: AiActivity };
const EMPTY_ACTIVITY: AiActivity = { aiStatus: null, lastAiAction: null };

/** Reads the two independent AI status records without letting one damaged record hide the other. */
export function readAiActivity(
  readStatus: () => AiLastStatus | null = readAiStatus,
  readLastAction: () => AiLastAction = getLastAiAction,
): AiActivity {
  let aiStatus: AiLastStatus | null = null;
  let lastAiAction: AiLastAction = null;
  try { aiStatus = readStatus(); } catch {}
  try { lastAiAction = readLastAction(); } catch {}
  return { aiStatus, lastAiAction };
}

/** Never render a previous account's AI activity during a scope transition. */
export function selectAiActivityForAccount(snapshot: ScopedActivity, accountId: AccountScope): AiActivity {
  return Object.is(snapshot.accountId, accountId) ? snapshot.activity : EMPTY_ACTIVITY;
}

/** Keeps transient AI status and retry metadata current while the app is open. */
export function useAiActivityStatus(refreshMs?: number): AiActivity;
export function useAiActivityStatus(accountId: string | null, refreshMs?: number): AiActivity;
export function useAiActivityStatus(accountIdOrRefresh: AccountScope | number = undefined, requestedRefreshMs = 2000): AiActivity {
  const accountId = typeof accountIdOrRefresh === 'number' ? undefined : accountIdOrRefresh;
  const refreshMs = typeof accountIdOrRefresh === 'number' ? accountIdOrRefresh : requestedRefreshMs;
  const readCurrentActivity = () => {
    if (accountId === null) return EMPTY_ACTIVITY;
    if (accountId === undefined) return readAiActivity();
    return readAiActivity(() => readAiStatus(accountId), () => getLastAiAction(accountId));
  };
  const [snapshot, setSnapshot] = useState<ScopedActivity>(() => ({
    accountId,
    activity: readCurrentActivity(),
  }));

  useEffect(() => {
    const refresh = () => setSnapshot({ accountId, activity: readCurrentActivity() });
    refresh();
    const timer = window.setInterval(() => {
      refresh();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [accountId, refreshMs]);

  return selectAiActivityForAccount(snapshot, accountId);
}
