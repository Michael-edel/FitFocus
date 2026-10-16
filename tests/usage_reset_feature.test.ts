import { describe, expect, it } from 'vitest';
import { type UserProfile } from '../types';
import { resetUsageIfNewPeriod } from '../features/usage/resetUsage';

const user = {
  id: 'user-1',
  name: 'Анна',
  usage: {
    dayKey: '2026-10-07',
    weekKey: '2026-41',
    aiFoodPhotoCount: 2,
    aiCoachCount: 1,
    familyMenuCount: 4,
  },
} as UserProfile;

describe('usage reset feature', () => {
  it('keeps the same profile reference in the current day and week', () => {
    expect(resetUsageIfNewPeriod(user, new Date(2026, 9, 7, 12))).toBe(user);
  });

  it('resets daily AI quotas with a stable local day key', () => {
    const result = resetUsageIfNewPeriod(user, new Date(2026, 9, 8, 12));

    expect(result.usage).toMatchObject({
      dayKey: '2026-10-08',
      weekKey: '2026-41',
      aiFoodPhotoCount: 0,
      aiCoachCount: 0,
      familyMenuCount: 4,
    });
  });

  it('resets the weekly family quota without changing current daily counters', () => {
    const result = resetUsageIfNewPeriod({
      ...user,
      usage: { ...user.usage, dayKey: '2026-10-12' },
    }, new Date(2026, 9, 12, 12));

    expect(result.usage).toMatchObject({
      dayKey: '2026-10-12',
      weekKey: '2026-42',
      aiFoodPhotoCount: 2,
      aiCoachCount: 1,
      familyMenuCount: 0,
    });
  });
});
