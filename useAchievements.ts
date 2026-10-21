import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AchievementEvaluationContext } from './achievements/engine';
import { AchievementClient, emptyAchievements } from './features/achievements/achievementClient';
import type { OutboxReadGuard } from './storage/durableOutbox';

export type UnlockedAchievement = {
  key: string;
  unlocked_at: number;
  tier: string;
  source?: string | null;
  created_at?: number;
};

export type AchievementCheckReason =
  | 'app_open'
  | 'food_manual_added'
  | 'ai_photo_success'
  | 'log_weight'
  | 'measurement_saved'
  | 'ai_coach_success'
  | 'ai_plan_created'
  | 'profile_details_completed'
  | 'wis_share_success'
  | 'weekly_menu_generated'
  | 'shopping_item_checked'
  | 'pdf_report_generated'
  | 'family_join_or_create'
  | 'habit_water_done'
  | 'sleep_8h_recorded';

type UseAchievementsParams = {
  userId?: string | null;
  getContext?: () => AchievementEvaluationContext;
  isCurrentSession: () => boolean;
  loginGuard: OutboxReadGuard | null;
};

export function useAchievements({ userId, getContext, isCurrentSession, loginGuard }: UseAchievementsParams) {
  const contextRef = useRef(getContext); contextRef.current = getContext;
  const [pageLifetime, setPageLifetime] = useState(0);
  const [status, setStatus] = useState<{ client: AchievementClient | null; value: ReturnType<typeof emptyAchievements> }>(() => ({ client: null, value: emptyAchievements() }));
  const client = useMemo(() => {
    if (!userId || loginGuard?.accountId !== userId) return null;
    const owner: AchievementClient = new AchievementClient({
      accountId: userId, loginGuard, isCurrentSession,
      getContext: () => contextRef.current?.() ?? {},
      onChange: value => setStatus({ client: owner, value }),
    });
    return owner;
  }, [userId, isCurrentSession, loginGuard, pageLifetime]);

  useLayoutEffect(() => {
    client?.activate(); void client?.load();
    const hide = () => client?.invalidate();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted && isCurrentSession()) setPageLifetime(previous => previous + 1);
    };
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
    return () => {
      client?.invalidate(); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
    };
  }, [client, isCurrentSession]);

  const value = status.client === client ? status.value : emptyAchievements();
  const unlockedKeys = useMemo(() => new Set(value.unlocked.map(item => item.key)), [value.unlocked]);
  // Capture this exact client; an old producer cannot address the next login's queue through a ref.
  const loadAchievements = useCallback(() => client?.load() ?? Promise.resolve(), [client]);
  const checkAchievements = useCallback((reason: AchievementCheckReason, patch: AchievementEvaluationContext = {}) =>
    client?.check(reason, patch) ?? Promise.resolve([]), [client]);
  const dismissAchievementToast = useCallback(() => client?.dismissToast(), [client]);

  return { ...value, unlockedKeys, loadAchievements, checkAchievements, dismissAchievementToast };
}
