import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AchievementDefinition } from './achievements/catalog';
import type { AchievementEvaluationContext } from './achievements/engine';

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
};

const COUNTER_PREFIX = 'fitfocus.achievements.counters.v1:';
const CHECK_THROTTLE_MS = 500;

function readCounters(userId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${COUNTER_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCounters(userId: string, counters: Record<string, number>) {
  try {
    localStorage.setItem(`${COUNTER_PREFIX}${userId}`, JSON.stringify(counters));
  } catch {
    // best effort only
  }
}

function incrementCounter(userId: string, key: string): number {
  const counters = readCounters(userId);
  const next = Number(counters[key] || 0) + 1;
  counters[key] = next;
  writeCounters(userId, counters);
  return next;
}

export function useAchievements({ userId, getContext }: UseAchievementsParams) {
  const [catalog, setCatalog] = useState<AchievementDefinition[]>([]);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const lastCheckAtRef = useRef(0);
  const throttledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCheckRef = useRef<{
    reason: AchievementCheckReason;
    contextPatch: AchievementEvaluationContext;
    resolve: (value: AchievementDefinition[]) => void;
  } | null>(null);

  const unlockedKeys = useMemo(() => new Set(unlocked.map((item) => item.key)), [unlocked]);

  const loadAchievements = useCallback(async () => {
    if (!userId) {
      setCatalog([]);
      setUnlocked([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/achievements', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'ACHIEVEMENTS_LOAD_FAILED');
      setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      setUnlocked(Array.isArray(data.unlocked) ? data.unlocked : []);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  useEffect(() => {
    return () => {
      if (throttledTimerRef.current) {
        clearTimeout(throttledTimerRef.current);
      }
      if (pendingCheckRef.current) {
        pendingCheckRef.current.resolve([]);
        pendingCheckRef.current = null;
      }
    };
  }, []);

  const runAchievementCheck = useCallback(async (reason: AchievementCheckReason, contextPatch: AchievementEvaluationContext = {}) => {
    if (!userId) return [];
    const baseContext = getContext?.() || {};
    const countersPatch: AchievementEvaluationContext = {};
    if (reason === 'ai_photo_success') {
      countersPatch.aiPhotoCount = incrementCounter(userId, 'aiPhotoCount');
      countersPatch.hasAiPhoto = true;
    }
    if (reason === 'wis_share_success') {
      countersPatch.wisShareCount = incrementCounter(userId, 'wisShareCount');
    }
    if (reason === 'pdf_report_generated') {
      countersPatch.pdfReportCount = incrementCounter(userId, 'pdfReportCount');
    }
    const context: AchievementEvaluationContext = {
      ...baseContext,
      ...countersPatch,
      ...contextPatch,
      source: reason,
    };

    try {
      const res = await fetch('/api/achievements/check', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return [];
      const nextCatalog = Array.isArray(data.catalog) ? data.catalog : catalog;
      const nextUnlocked = Array.isArray(data.newlyUnlocked) ? data.newlyUnlocked : [];
      setCatalog(nextCatalog);
      if (nextUnlocked.length) {
        setUnlocked((prev) => {
          const seen = new Set(prev.map((item) => item.key));
          const additions = nextUnlocked
            .filter((item: any) => item?.key && !seen.has(item.key))
            .map((item: any) => ({
              key: String(item.key),
              unlocked_at: Number(item.unlocked_at || Date.now()),
              tier: String(item.tier || ''),
              source: item.source ? String(item.source) : null,
          }));
          return [...additions, ...prev];
        });
        setNewlyUnlocked((prev) => [...prev, ...nextUnlocked]);
      }
      return nextUnlocked;
    } catch {
      return [];
    }
  }, [catalog, getContext, userId]);

  const checkAchievements = useCallback((reason: AchievementCheckReason, contextPatch: AchievementEvaluationContext = {}) => {
    if (!userId) return Promise.resolve([]);
    const now = Date.now();
    const elapsed = now - lastCheckAtRef.current;
    if (elapsed >= CHECK_THROTTLE_MS && !throttledTimerRef.current) {
      lastCheckAtRef.current = now;
      return runAchievementCheck(reason, contextPatch);
    }

    return new Promise<AchievementDefinition[]>((resolve) => {
      if (pendingCheckRef.current) {
        pendingCheckRef.current.resolve([]);
      }
      pendingCheckRef.current = { reason, contextPatch, resolve };
      if (throttledTimerRef.current) {
        clearTimeout(throttledTimerRef.current);
      }
      const delay = Math.max(0, CHECK_THROTTLE_MS - elapsed);
      throttledTimerRef.current = setTimeout(() => {
        throttledTimerRef.current = null;
        const pending = pendingCheckRef.current;
        pendingCheckRef.current = null;
        if (!pending) return;
        lastCheckAtRef.current = Date.now();
        void runAchievementCheck(pending.reason, pending.contextPatch).then(pending.resolve).catch(() => pending.resolve([]));
      }, delay);
    });
  }, [runAchievementCheck, userId]);

  const dismissAchievementToast = useCallback(() => {
    setNewlyUnlocked((prev) => prev.slice(1));
  }, []);

  return {
    catalog,
    unlocked,
    unlockedKeys,
    newlyUnlocked,
    loading,
    loadAchievements,
    checkAchievements,
    dismissAchievementToast,
  };
}
