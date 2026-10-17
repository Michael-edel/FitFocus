import { useCallback, useLayoutEffect, useMemo } from 'react';
import type { AiSession } from '../../services/aiSession';
import { assertAiSession, prepareAiSession } from '../../services/aiSession';
import { SessionReadError } from '../../storage/sessionRead';
import type { OutboxCommitGuard, OutboxReadGuard, OutboxOperation } from '../../storage/durableOutbox';
import type { FoodPhotoAnalysisResult } from '../../geminiService';
import type { FastLogItem } from '../../storage/foodDiary';
import type { FoodInsight, FoodItem } from '../../types';
import { AiActionScope } from './actionScope';

export type FoodPhotoInsight = {
  id: string;
  photo: string;
  name: string;
  insight: FoodInsight;
  nonFood?: boolean;
};

type CompressedPhoto = {
  dataUrl: string;
  thumbUrl: string;
  base64: string;
};

/** Treats an unknown quota as unavailable, while preserving explicit unlimited plans. */
export function getRemainingFoodPhotoScans(
  allowance: number | undefined,
  usedScans: number | undefined,
): number {
  if (allowance === Infinity) return Infinity;
  if (!Number.isFinite(allowance) || allowance <= 0) return 0;

  const used = typeof usedScans === 'number' && usedScans > 0 ? usedScans : 0;
  return Math.max(0, allowance - used);
}

export function buildFoodInsight(result: FoodPhotoAnalysisResult): FoodInsight {
  const nonFood = result.nonFood === true;
  return {
    calories: nonFood ? 0 : result.calories,
    macros: {
      protein: nonFood ? 0 : result.protein,
      fat: nonFood ? 0 : result.fat,
      carbs: nonFood ? 0 : result.carbs,
    },
    ingredients: nonFood || !Array.isArray(result.ingredients) ? [] : result.ingredients,
    notes: Array.isArray(result.notes) ? result.notes : [],
  };
}

export function buildPhotoDiaryItem(
  result: FoodPhotoAnalysisResult,
  photo: CompressedPhoto,
): FastLogItem & { insight: FoodInsight } {
  const nonFood = result.nonFood === true;
  return {
    ...result,
    ...(nonFood ? { calories: 0, protein: 0, fat: 0, carbs: 0, ingredients: [], nonFood: true } : {}),
    photo: photo.dataUrl,
    photoThumb: photo.thumbUrl,
    insight: buildFoodInsight(result),
  };
}

export type FoodPhotoAnalysisRunParams = {
  userId: string | null | undefined;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
  controller: AbortController;
  files: File[];
  remainingScans: number;
  openPaywall: () => void;
  setScanning: (scanning: boolean) => void;
  compressPhoto: (file: File) => Promise<CompressedPhoto>;
  analyzePhoto: (base64: string, session: AiSession) => Promise<FoodPhotoAnalysisResult | null>;
  addFoodToDiary: (
    item: FastLogItem,
    guard: OutboxCommitGuard,
    isCurrent: () => boolean,
  ) => Promise<FoodItem | undefined>;
  incrementUsage: (guard: OutboxCommitGuard) => Promise<OutboxOperation | null>;
  showInsight: (insight: FoodPhotoInsight) => void;
  logError?: (error: unknown) => void;
  prepareSession?: typeof prepareAiSession;
  assertSession?: typeof assertAiSession;
};

async function stillCurrent(session: AiSession, isCurrent: () => boolean,
  assertSession: typeof assertAiSession): Promise<boolean> {
  if (!isCurrent()) return false;
  try {
    await assertSession(session);
    return isCurrent();
  } catch {
    return false;
  }
}

function isExpectedSessionFailure(error: unknown): boolean {
  return error instanceof SessionReadError && (error.kind === 'session' || error.kind === 'auth');
}

/** Processes only the remaining allowance; every result and write stays with its login attempt. */
export async function processFoodPhotoFiles({
  userId,
  loginGuard,
  isCurrentSession,
  controller,
  files,
  remainingScans,
  openPaywall,
  setScanning,
  compressPhoto,
  analyzePhoto,
  addFoodToDiary,
  incrementUsage,
  showInsight,
  logError = console.error,
  prepareSession = prepareAiSession,
  assertSession = assertAiSession,
}: FoodPhotoAnalysisRunParams): Promise<number> {
  const current = () => !controller.signal.aborted && isCurrentSession();
  if (!userId || !files.length || !current()) return 0;

  const unlimited = remainingScans === Infinity;
  if (!unlimited && (!Number.isFinite(remainingScans) || remainingScans <= 0)) {
    if (current()) openPaywall();
    return 0;
  }
  if (!loginGuard) return 0;

  const batch = unlimited ? files : files.slice(0, Math.floor(remainingScans));
  let processed = 0;
  let session: AiSession | undefined;
  setScanning(true);
  try {
    session = await prepareSession(userId, controller, current, { previous: loginGuard });
    if (!current()) return 0;

    for (const file of batch) {
      if (!current()) break;
      try {
        const photo = await compressPhoto(file);
        if (!current() || !await stillCurrent(session, current, assertSession)) break;

        const result = await analyzePhoto(photo.base64, session);
        if (!current() || !await stillCurrent(session, current, assertSession)) break;
        if (!result) continue;

        const guard: OutboxCommitGuard = { readGuard: session.guard, canCommit: current };
        const item = buildPhotoDiaryItem(result, photo);
        const newEntry = await addFoodToDiary(item, guard, current);
        if (!newEntry || !current() || !await stillCurrent(session, current, assertSession)) break;

        const usageOperation = await incrementUsage(guard);
        if (!current() || !await stillCurrent(session, current, assertSession)) break;
        if (usageOperation?.status !== 'pending') continue;

        showInsight({
          id: newEntry.id,
          photo: photo.dataUrl,
          name: result.name,
          insight: item.insight,
          nonFood: newEntry.nonFood === true,
        });
        processed += 1;
      } catch (error) {
        if (current() && (!session || await stillCurrent(session, current, assertSession))) {
          if (!isExpectedSessionFailure(error)) logError(error);
        }
      }
    }
  } catch (error) {
    if (current() && !isExpectedSessionFailure(error)) logError(error);
  } finally {
    if (current()) setScanning(false);
  }

  return processed;
}

type UseFoodPhotoAnalysisParams = Omit<FoodPhotoAnalysisRunParams, 'files' | 'controller'>;

export function useFoodPhotoAnalysis({
  userId,
  loginGuard,
  isCurrentSession,
  remainingScans,
  openPaywall,
  setScanning,
  compressPhoto,
  analyzePhoto,
  addFoodToDiary,
  incrementUsage,
  showInsight,
  logError,
  prepareSession,
  assertSession,
}: UseFoodPhotoAnalysisParams) {
  const scope = useMemo(() => new AiActionScope(isCurrentSession), [userId, isCurrentSession]);
  useLayoutEffect(() => {
    scope.activate();
    setScanning(false);
    const hide = () => scope.invalidate();
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      scope.activate();
      setScanning(false);
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      scope.invalidate();
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [scope, setScanning]);

  return useCallback((files: File[]) => {
    const attempt = scope.begin();
    if (!attempt) return Promise.resolve(0);
    return processFoodPhotoFiles({
      userId,
      loginGuard,
      isCurrentSession: attempt.isCurrent,
      controller: attempt.controller,
      files,
      remainingScans,
      openPaywall: () => { if (attempt.isCurrent()) openPaywall(); },
      setScanning: scanning => { if (attempt.isCurrent()) setScanning(scanning); },
      compressPhoto,
      analyzePhoto,
      addFoodToDiary,
      incrementUsage,
      showInsight: insight => { if (attempt.isCurrent()) showInsight(insight); },
      logError,
      prepareSession,
      assertSession,
    }).finally(attempt.finish);
  }, [addFoodToDiary, analyzePhoto, assertSession, compressPhoto, incrementUsage, isCurrentSession, loginGuard, logError,
    openPaywall, prepareSession, remainingScans, scope, setScanning, showInsight, userId]);
}
