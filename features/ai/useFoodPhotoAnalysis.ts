import { useCallback } from 'react';
import type { FoodPhotoAnalysisResult } from '../../geminiService';
import type { FastLogItem } from '../../storage/foodDiary';
import type { FoodInsight, FoodItem } from '../../types';

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
  files: File[];
  remainingScans: number;
  openPaywall: () => void;
  setScanning: (scanning: boolean) => void;
  compressPhoto: (file: File) => Promise<CompressedPhoto>;
  analyzePhoto: (base64: string) => Promise<FoodPhotoAnalysisResult | null>;
  addFoodToDiary: (item: FastLogItem) => FoodItem | undefined;
  incrementUsage: () => void;
  showInsight: (insight: FoodPhotoInsight) => void;
  logError?: (error: unknown) => void;
};

/** Processes only the remaining paid/free photo allowance and keeps diary writes local-first. */
export async function processFoodPhotoFiles({
  userId,
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
}: FoodPhotoAnalysisRunParams): Promise<number> {
  if (!userId || !files.length) return 0;
  if (remainingScans <= 0) {
    openPaywall();
    return 0;
  }

  const batch = files.slice(0, Number.isFinite(remainingScans) ? remainingScans : files.length);
  let processed = 0;
  setScanning(true);
  try {
    for (const file of batch) {
      const photo = await compressPhoto(file);
      const result = await analyzePhoto(photo.base64);
      if (!result) continue;

      const item = buildPhotoDiaryItem(result, photo);
      const newEntry = addFoodToDiary(item);
      if (newEntry) {
        showInsight({
          id: newEntry.id,
          photo: photo.dataUrl,
          name: result.name,
          insight: item.insight,
          nonFood: newEntry.nonFood === true,
        });
      }
      incrementUsage();
      processed += 1;
    }
  } catch (error) {
    logError(error);
  } finally {
    setScanning(false);
  }

  return processed;
}

type UseFoodPhotoAnalysisParams = Omit<FoodPhotoAnalysisRunParams, 'files'>;

export function useFoodPhotoAnalysis({
  userId,
  remainingScans,
  openPaywall,
  setScanning,
  compressPhoto,
  analyzePhoto,
  addFoodToDiary,
  incrementUsage,
  showInsight,
  logError,
}: UseFoodPhotoAnalysisParams) {
  return useCallback((files: File[]) => processFoodPhotoFiles({
    userId,
    files,
    remainingScans,
    openPaywall,
    setScanning,
    compressPhoto,
    analyzePhoto,
    addFoodToDiary,
    incrementUsage,
    showInsight,
    logError,
  }), [
    addFoodToDiary,
    analyzePhoto,
    compressPhoto,
    incrementUsage,
    logError,
    openPaywall,
    remainingScans,
    setScanning,
    showInsight,
    userId,
  ]);
}
