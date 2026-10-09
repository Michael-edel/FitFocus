import { buildFallbackAiPlan } from "../../aiPlanFallback";
import { hydrateSessionFromCloud, type HydratedSession } from "../../sessionHydration";
import {
  persistAllUsersSnapshot,
  readStoredAllUsersSnapshotForUser,
  renameLocalStoragePrefix,
} from "../../storage/hybrid";
import type { UserHabit, UserProfile } from "../../types";

export type AuthIdentity = { sub?: string; email?: string; picture?: string } | null | undefined;

type LoginSessionDeps = {
  initialHabits: UserHabit[];
  resetUsageIfNewTime: (user: UserProfile) => UserProfile;
  hydrateSession?: typeof hydrateSessionFromCloud;
  buildFallbackPlan?: typeof buildFallbackAiPlan;
  renameStoragePrefix?: typeof renameLocalStoragePrefix;
  persistUsersSnapshot?: typeof persistAllUsersSnapshot;
  readUsersSnapshot?: typeof readStoredAllUsersSnapshotForUser<UserProfile>;
};

export type PreparedLoginSession = {
  currentUser: UserProfile;
  hydrated: HydratedSession;
  shouldPersistFallbackPlan: boolean;
};

/** Prepares a cloud-backed session while keeping local data scoped to the verified identity. */
export async function prepareLoginSession(
  user: UserProfile,
  authUser: AuthIdentity,
  deps: LoginSessionDeps,
): Promise<PreparedLoginSession> {
  const hydrateSession = deps.hydrateSession ?? hydrateSessionFromCloud;
  const buildFallbackPlan = deps.buildFallbackPlan ?? buildFallbackAiPlan;
  const renameStoragePrefix = deps.renameStoragePrefix ?? renameLocalStoragePrefix;
  const persistUsersSnapshot = deps.persistUsersSnapshot ?? persistAllUsersSnapshot;
  const readUsersSnapshot = deps.readUsersSnapshot ?? readStoredAllUsersSnapshotForUser<UserProfile>;
  const identity = authUser?.sub?.trim();

  const normalizedUser = identity && user.id !== identity
    ? { ...user, id: identity, googleSub: identity, email: authUser?.email ?? user.email, picture: authUser?.picture ?? user.picture }
    : user;

  if (identity && user.id !== identity) {
    renameStoragePrefix(`fitfocus_data_${user.id}_`, `fitfocus_data_${identity}_`);
    persistUsersSnapshot(identity, (readUsersSnapshot(user.id) || [user]).map((profile) =>
      profile.id === user.id
        ? { ...profile, id: identity, googleSub: identity, email: authUser?.email ?? profile.email, picture: authUser?.picture ?? profile.picture }
        : profile,
    ));
  }

  const hydrated = await hydrateSession(normalizedUser, {
    resetUsageIfNewTime: deps.resetUsageIfNewTime,
    initialHabits: deps.initialHabits,
  });
  const normalizedCurrentUser = identity && hydrated.currentUser.id !== identity
    ? { ...hydrated.currentUser, id: identity, googleSub: identity, email: authUser?.email ?? hydrated.currentUser.email, picture: authUser?.picture ?? hydrated.currentUser.picture }
    : hydrated.currentUser;
  const shouldPersistFallbackPlan = !normalizedCurrentUser.aiPlan;
  return {
    currentUser: shouldPersistFallbackPlan ? { ...normalizedCurrentUser, aiPlan: buildFallbackPlan(normalizedCurrentUser) } : normalizedCurrentUser,
    hydrated,
    shouldPersistFallbackPlan,
  };
}
