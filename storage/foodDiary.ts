import type { FoodItem } from '../types';

export type FastLogItem = Omit<FoodItem, 'id' | 'timestamp'> & Partial<Pick<FoodItem, 'timestamp'>>;

export const MAX_DIARY_ITEMS = 500;
export const MAX_HISTORY_ITEMS = 500;

export function sanitizeFoodEntryForStorage<T extends Partial<FoodItem>>(entry: T): T {
  const sanitized: Partial<FoodItem> = { ...entry };
  if (typeof sanitized.photo === 'string') delete sanitized.photo;
  if (typeof sanitized.photoThumb === 'string' && sanitized.photoThumb.length > 120_000) {
    delete sanitized.photoThumb;
  }
  return sanitized as T;
}
