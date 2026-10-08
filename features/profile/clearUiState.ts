import { safeRemoveItem } from '../../storage/hybrid';

export function appUiStorageKeys(userId: string): string[] {
  return [
    `fitfocus.dashboard.new-weight.v1:${userId}`,
    `fitfocus.course.ui.v1:${userId}`,
    `fitfocus.plan.ui.v1:${userId}`,
    `fitfocus.plan.active-day.v1:${userId}`,
    `fitfocus.progress.ui.v1:${userId}`,
    `fitfocus.progress-archive.sections.v1:${userId}`,
    `fitfocus.settings.ui.v1:${userId}`,
    `fitfocus.dashboard.pdf-include-meal-log.v1:${userId}`,
    `fitfocus.dashboard.mobile-more-open.v1:${userId}`,
    `fitfocus.nutrition.search.v1:${userId}`,
    `fitfocus.nutrition.camera-facing.v1:${userId}`,
  ];
}

/** Removes per-profile UI preferences without touching synchronized user data. */
export function clearAppUiStorage(userId: string | null | undefined): void {
  if (!userId) return;
  for (const key of appUiStorageKeys(userId)) safeRemoveItem(key);
}