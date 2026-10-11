import { buildFallbackAiPlan } from "../../aiPlanFallback";
import { hydrateSessionFromCloud, type HydratedSession } from "../../sessionHydration";
import type { UserHabit, UserProfile } from "../../types";

export type AuthIdentity = { sub?: string; email?: string; picture?: string } | null | undefined;

type LoginSessionDeps = {
  initialHabits: UserHabit[];
  resetUsageIfNewTime: (user: UserProfile) => UserProfile;
  hydrateSession?: typeof hydrateSessionFromCloud;
  buildFallbackPlan?: typeof buildFallbackAiPlan;
  isCurrentSession?: () => boolean;
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
  const identity = authUser?.sub?.trim();
  const isCurrent = deps.isCurrentSession ?? (() => true);
  if (!isCurrent()) throw new Error('LOGIN_SESSION_CHANGED');
  if (!identity || user.id !== identity) throw new Error('PROFILE_ACCOUNT_MISMATCH');
  const hydrated = await hydrateSession(user, {
    resetUsageIfNewTime: deps.resetUsageIfNewTime,
    initialHabits: deps.initialHabits,
    isCurrentSession: isCurrent,
  });
  if (!isCurrent()) throw new Error('LOGIN_SESSION_CHANGED');
  if (hydrated.currentUser.id !== identity) throw new Error('PROFILE_ACCOUNT_MISMATCH');
  const normalizedCurrentUser = hydrated.currentUser;
  hydrated.allUsers = [normalizedCurrentUser];
  const shouldPersistFallbackPlan = !normalizedCurrentUser.aiPlan;
  return {
    currentUser: shouldPersistFallbackPlan ? { ...normalizedCurrentUser, aiPlan: buildFallbackPlan(normalizedCurrentUser) } : normalizedCurrentUser,
    hydrated,
    shouldPersistFallbackPlan,
  };
}
