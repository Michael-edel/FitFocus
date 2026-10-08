import { describe, expect, it, vi } from "vitest";
import { prepareLoginSession } from "../features/auth/loginSession";
import type { UserProfile } from "../types";

const user = { id: "legacy-user", name: "Тест", email: "old@example.test" } as UserProfile;

describe("prepareLoginSession", () => {
  it("moves local state to the verified identity before hydrating the cloud session", async () => {
    const renameStoragePrefix = vi.fn();
    const persistUsersSnapshot = vi.fn();
    const hydrateSession = vi.fn(async (input: UserProfile) => ({
      currentUser: { ...input },
      allUsers: [], weeklyReports: [], foodDiary: [], habits: [], foodHistory: [], foodFavorites: [], coachCard: null,
    }));
    const buildFallbackPlan = vi.fn(() => ({ title: "fallback" } as NonNullable<UserProfile["aiPlan"]>));

    const prepared = await prepareLoginSession(user, { sub: "verified-user", email: "new@example.test" }, {
      initialHabits: [],
      resetUsageIfNewTime: (profile) => profile,
      hydrateSession: hydrateSession as never,
      buildFallbackPlan: buildFallbackPlan as never,
      renameStoragePrefix,
      persistUsersSnapshot,
      readUsersSnapshot: () => [user],
    });

    expect(renameStoragePrefix).toHaveBeenCalledWith("fitfocus_data_legacy-user_", "fitfocus_data_verified-user_");
    expect(persistUsersSnapshot).toHaveBeenCalledWith("verified-user", [expect.objectContaining({ id: "verified-user", email: "new@example.test" })]);
    expect(hydrateSession).toHaveBeenCalledWith(expect.objectContaining({ id: "verified-user", googleSub: "verified-user" }), expect.any(Object));
    expect(prepared.currentUser).toMatchObject({ id: "verified-user", googleSub: "verified-user", email: "new@example.test" });
    expect(prepared.shouldPersistFallbackPlan).toBe(true);
  });

  it("keeps an existing AI plan without requesting a fallback", async () => {
    const withPlan = { ...user, id: "verified-user", aiPlan: { title: "existing" } } as UserProfile;
    const buildFallbackPlan = vi.fn();
    const prepared = await prepareLoginSession(withPlan, { sub: "verified-user" }, {
      initialHabits: [],
      resetUsageIfNewTime: (profile) => profile,
      hydrateSession: (async () => ({ currentUser: withPlan, allUsers: [], weeklyReports: [], foodDiary: [], habits: [], foodHistory: [], foodFavorites: [], coachCard: null })) as never,
      buildFallbackPlan: buildFallbackPlan as never,
    });

    expect(prepared.currentUser.aiPlan).toEqual({ title: "existing" });
    expect(prepared.shouldPersistFallbackPlan).toBe(false);
    expect(buildFallbackPlan).not.toHaveBeenCalled();
  });
});
