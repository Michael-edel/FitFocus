import { useCallback, useLayoutEffect, useMemo } from 'react';
import type { AiSession } from '../../services/aiSession';
import { assertAiSession, prepareAiSession } from '../../services/aiSession';
import { isExpectedAiSessionFailure } from '../../services/frontendErrors';
import type { OutboxCommitGuard, OutboxReadGuard, OutboxOperation } from '../../storage/durableOutbox';
import { AiProxyError, type FoodPhotoAnalysisResult } from '../../geminiService';
import type { FastLogItem } from '../../storage/foodDiary';
import type { FoodInsight } from '../../types';
import { AiActionScope } from './actionScope';
import { RejectedFoodPhotoError } from '../../services/foodPhotoGuard';

export type FoodPhotoDraft = {
  item: FastLogItem & { insight: FoodInsight };
  guard: OutboxCommitGuard;
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
  incrementUsage: (guard: OutboxCommitGuard) => Promise<OutboxOperation | null>;
  showDraft: (draft: FoodPhotoDraft) => void;
  showRejection: (message: string | null) => void;
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

const MAX_COOLDOWN_WAIT_MS = 10_000;

function waitForCooldown(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

function cooldownDelay(error: unknown): number | undefined {
  if (!(error instanceof AiProxyError) || error.status !== 429 || error.code !== 'AI_COOLDOWN') return;
  const ms = error.retryAfterMs;
  if (ms && ms > 0 && ms <= MAX_COOLDOWN_WAIT_MS) return Math.ceil(ms);
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
  incrementUsage,
  showDraft,
  showRejection,
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
  const failures: string[] = [];
  let skipped = files.length - batch.length;
  let session: AiSession | undefined;
  showRejection(null);
  setScanning(true);
  try {
    session = await prepareSession(userId, controller, current, { previous: loginGuard });
    if (!current()) return 0;

    for (const [index, file] of batch.entries()) {
      if (!current()) break;
      const reportFailure = (message: string) => {
        failures.push(files.length === 1 ? message : `Фото ${index + 1} (${file.name}). ${message}`);
      };
      try {
        const photo = await compressPhoto(file);
        if (!current() || !await stillCurrent(session, current, assertSession)) break;

        let result: FoodPhotoAnalysisResult | null;
        try {
          result = await analyzePhoto(photo.base64, session);
        } catch (error) {
          const delay = cooldownDelay(error);
          if (!delay || !current()) throw error;
          await waitForCooldown(delay, controller.signal);
          if (!await stillCurrent(session, current, assertSession)) break;
          result = await analyzePhoto(photo.base64, session);
        }
        if (!current() || !await stillCurrent(session, current, assertSession)) break;
        if (!result) throw new Error('Missing food photo analysis');
        if (result.nonFood !== false) throw new RejectedFoodPhotoError('non_food');

        const guard: OutboxCommitGuard = { readGuard: session.guard, canCommit: current };
        const usageOperation = await incrementUsage(guard);
        if (!current() || !await stillCurrent(session, current, assertSession)) break;
        if (usageOperation?.status !== 'pending') {
          reportFailure('Не удалось сохранить состояние анализа.');
          continue;
        }
        showDraft({ item: buildPhotoDiaryItem(result, photo), guard });
        processed += 1;
      } catch (error) {
        if (!await stillCurrent(session, current, assertSession) || isExpectedAiSessionFailure(error)) break;
        if (error instanceof RejectedFoodPhotoError) {
          reportFailure(error.message);
          continue;
        }
        if (error instanceof AiProxyError && ['PAYWALL', 'DAILY_LIMIT', 'AI_LIMIT'].includes(error.code ?? '')) {
          reportFailure('Лимит анализа AI исчерпан. Повторите попытку позже.');
          skipped += batch.length - index - 1;
          break;
        }
        logError(error);
        reportFailure(error instanceof AiProxyError && error.status === 429
          ? 'Слишком много запросов. Повторите попытку чуть позже.'
          : 'Не удалось обработать фото. Попробуйте ещё раз.');
      }
    }
  } catch (error) {
    if (current() && !isExpectedAiSessionFailure(error)) {
      logError(error);
      failures.push('Не удалось начать анализ фото. Попробуйте ещё раз.');
    }
  } finally {
    if (current()) {
      if (skipped) failures.push(`Фото за пределами лимита: ${skipped}.`);
      if (failures.length && (!session || await stillCurrent(session, current, assertSession))) {
        showRejection(failures.join('\n'));
      }
      if (current()) setScanning(false);
    }
  }

  return processed;
}

type UseFoodPhotoAnalysisParams = Omit<FoodPhotoAnalysisRunParams, 'files' | 'controller'> & { clearDrafts: () => void };

export function useFoodPhotoAnalysis({
  userId,
  loginGuard,
  isCurrentSession,
  remainingScans,
  openPaywall,
  setScanning,
  compressPhoto,
  analyzePhoto,
  incrementUsage,
  showDraft,
  clearDrafts,
  showRejection,
  logError,
  prepareSession,
  assertSession,
}: UseFoodPhotoAnalysisParams) {
  const scope = useMemo(() => new AiActionScope(isCurrentSession), [userId, isCurrentSession]);
  useLayoutEffect(() => {
    scope.activate();
    setScanning(false);
    const hide = () => { scope.invalidate(); clearDrafts(); };
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
  }, [scope, setScanning, clearDrafts]);

  return useCallback((files: File[]) => {
    const attempt = scope.begin();
    if (!attempt) return Promise.resolve(0);
    clearDrafts();
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
      incrementUsage,
      showDraft: draft => { if (attempt.isCurrent()) showDraft(draft); },
      showRejection: message => { if (attempt.isCurrent()) showRejection(message); },
      logError,
      prepareSession,
      assertSession,
    }).finally(attempt.finish);
  }, [analyzePhoto, assertSession, clearDrafts, compressPhoto, incrementUsage, loginGuard, logError,
    openPaywall, prepareSession, remainingScans, scope, setScanning, showDraft, showRejection, userId]);
}
