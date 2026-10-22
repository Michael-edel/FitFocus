import { writeProfileCas } from './profile_cas';
import { loadActivePlan } from './plans';
import {
  buildHuaweiSyncedProfile,
  loadHuaweiProfile,
  markHuaweiSynced,
  protectHuaweiProfile,
  type HuaweiDailySnapshot,
} from './huawei_health';
import type { SessionUser } from './auth';
import type { JsonObject } from './json';

export type HuaweiProfileSyncResult =
  | { kind: 'synced'; profile: JsonObject; version: number }
  | { kind: 'conflict'; profile: JsonObject; version: number };

/** Applies one fetched Huawei snapshot using the profile's optimistic-lock version. */
export async function syncHuaweiProfile(input: {
  db: D1Database;
  user: SessionUser;
  snapshot: HuaweiDailySnapshot;
  date?: string;
  hasExplicitBaseVersion: boolean;
  requestedBaseVersion: number;
  now: number;
}): Promise<HuaweiProfileSyncResult> {
  const current = await loadHuaweiProfile(input.db, input.user.sub);
  if (input.hasExplicitBaseVersion && input.requestedBaseVersion !== current.version) {
    return {
      kind: 'conflict',
      profile: protectHuaweiProfile(input.user, { ...current.profile, version: current.version }),
      version: current.version,
    };
  }

  const expectedVersion = input.hasExplicitBaseVersion ? input.requestedBaseVersion : current.version;
  const version = expectedVersion + 1;
  const plan = await loadActivePlan(input.db, input.user.sub);
  const profile = buildHuaweiSyncedProfile({
    user: input.user,
    currentProfile: current.profile,
    plan,
    version,
    timestamp: new Date(input.now).toISOString(),
    date: input.date,
    snapshot: input.snapshot,
  });
  const written = await writeProfileCas(input.db, input.user.sub, profile, expectedVersion, input.now);
  if (!written) {
    const latest = await loadHuaweiProfile(input.db, input.user.sub);
    return {
      kind: 'conflict',
      profile: protectHuaweiProfile(input.user, { ...latest.profile, version: latest.version }),
      version: latest.version,
    };
  }

  await markHuaweiSynced(input.db, input.user.sub, input.now);
  return { kind: 'synced', profile, version };
}
