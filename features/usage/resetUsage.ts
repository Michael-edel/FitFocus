import { getDayKey, getWeekKey } from '../../dateUtils';
import type { UserProfile } from '../../types';

/** Resets only the quotas whose local calendar period has changed. */
export function resetUsageIfNewPeriod(
  user: UserProfile,
  now: Date = new Date(),
): UserProfile {
  const dayKey = getDayKey(now);
  const weekKey = getWeekKey(now);
  const usage = user.usage || {};
  const nextUsage = { ...usage };
  let updated = false;

  if (usage.dayKey !== dayKey) {
    nextUsage.dayKey = dayKey;
    nextUsage.aiFoodPhotoCount = 0;
    nextUsage.aiCoachCount = 0;
    updated = true;
  }
  if (usage.weekKey !== weekKey) {
    nextUsage.weekKey = weekKey;
    nextUsage.familyMenuCount = 0;
    updated = true;
  }

  return updated ? { ...user, usage: nextUsage } : user;
}
