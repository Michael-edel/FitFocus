import { describe, expect, it } from "vitest";
import { buildAchievementContext } from "../features/achievements/achievementContext";
import type { UserProfile } from "../types";

const profile = {
  id: "user-1",
  weight: 74,
  profileDetailsCompleted: true,
  weightHistory: [{ date: "2026-10-01", weight: 78 }, { date: "2026-10-08", weight: 74 }],
  measurementsHistory: [{ date: "2026-10-08" }],
  wearableSleepHoursLastNight: 8,
  dailyHabits: { "2026-10-08": { water: true } },
  aiPlan: { weeklyMenu: { days: [] } },
} as unknown as UserProfile;

describe("buildAchievementContext", () => {
  it("creates a complete achievement snapshot from app state", () => {
    const context = buildAchievementContext({
      currentUser: profile,
      foodDiary: [{ timestamp: "2026-10-08T12:00:00.000Z" }],
      weeklyReportsCount: 3,
      shoppingItems: [{ checked: true }, { checked: false }],
      familyActive: true,
      todayKey: "2026-10-08",
    });

    expect(context).toMatchObject({
      profileExists: true,
      profileDetailsCompleted: true,
      hasAiPlan: true,
      hasWeeklyMenu: true,
      foodDiaryCount: 1,
      weightHistoryCount: 2,
      initialWeight: 78,
      latestWeight: 74,
      measurementsCount: 1,
      wisCount: 3,
      shoppingCheckedCount: 1,
      familyActive: true,
      waterToday: true,
      sleepHours: 8,
    });
  });

  it("uses safe zero and null values without a profile", () => {
    expect(buildAchievementContext({
      currentUser: null,
      foodDiary: [],
      weeklyReportsCount: 0,
      familyActive: false,
      todayKey: "2026-10-08",
    })).toMatchObject({
      profileExists: false,
      foodDiaryCount: 0,
      weightHistoryCount: 0,
      initialWeight: null,
      latestWeight: null,
      shoppingCheckedCount: 0,
      waterToday: false,
      sleepHours: null,
    });
  });
});
