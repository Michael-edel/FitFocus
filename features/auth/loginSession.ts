import { hydrateSessionFromCloud, type HydratedSession } from "../../sessionHydration";
import type { UserHabit, UserProfile } from "../../types";
import type { OutboxReadGuard } from '../../storage/durableOutbox';

export type AuthIdentity = { sub?: string; email?: string; picture?: string } | null | undefined;

type LoginSessionDeps = {
  initialHabits: UserHabit[];
  resetUsageIfNewTime: (user: UserProfile) => UserProfile;
  hydrateSession?: typeof hydrateSessionFromCloud;
  isCurrentSession?: () => boolean;
  readGuard?: OutboxReadGuard;
};

export type PreparedLoginSession = {
  currentUser: UserProfile;
  hydrated: HydratedSession;
};

/** Prepares a cloud-backed session while keeping local data scoped to the verified identity. */
export async function prepareLoginSession(
  user: UserProfile,
  authUser: AuthIdentity,
  deps: LoginSessionDeps,
): Promise<PreparedLoginSession> {
  const hydrateSession = deps.hydrateSession ?? hydrateSessionFromCloud;
  const identity = authUser?.sub?.trim();
  const isCurrent = deps.isCurrentSession ?? (() => true);
  if (!isCurrent()) throw new Error('LOGIN_SESSION_CHANGED');
  if (!identity || user.id !== identity) throw new Error('PROFILE_ACCOUNT_MISMATCH');
  const hydrated = await hydrateSession(user, {
    resetUsageIfNewTime: deps.resetUsageIfNewTime,
    initialHabits: deps.initialHabits,
    isCurrentSession: isCurrent,
    readGuard: deps.readGuard,
  });
  if (!isCurrent()) throw new Error('LOGIN_SESSION_CHANGED');
  if (hydrated.currentUser.id !== identity) throw new Error('PROFILE_ACCOUNT_MISMATCH');
  const normalizedCurrentUser = hydrated.currentUser;
  hydrated.allUsers = [normalizedCurrentUser];
  return {
    currentUser: normalizedCurrentUser,
    hydrated,
  };
}
