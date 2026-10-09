import { withProtectedFields } from './legacy_sync';
import { loadActivePlan } from './plans';
import { writeProfileCas } from './profile_cas';
import { normalizeProfileRecord } from './profile_contract';
import { huaweiProviderId, loadHuaweiProfile } from './huawei_health';
import type { SessionUser } from './auth';
import type { JsonObject } from './json';

export type HuaweiDisconnectResult =
  | { kind: 'disconnected'; profile: JsonObject; version: number }
  | { kind: 'conflict'; profile: JsonObject; version: number };

/** Removes Huawei credentials and disables its profile integration using CAS. */
export async function disconnectHuaweiProfile(input: {
  db: D1Database;
  user: SessionUser;
  now?: number;
  maxAttempts?: number;
}): Promise<HuaweiDisconnectResult> {
  const provider = huaweiProviderId();
  await input.db.prepare('DELETE FROM wearable_connections WHERE user_id = ? AND provider = ?').bind(input.user.sub, provider).run();

  const attempts = Math.max(1, input.maxAttempts ?? 3);
  let plan: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await loadHuaweiProfile(input.db, input.user.sub);
    if (current.profile.wearableProvider !== provider) {
      return { kind: 'disconnected', profile: current.profile, version: current.version };
    }
    plan ??= await loadActivePlan(input.db, input.user.sub);
    const version = current.version + 1;
    const profile = withProtectedFields(input.user, normalizeProfileRecord({
      ...current.profile,
      plan,
      version,
      wearableEnabled: false,
    }));
    if (await writeProfileCas(input.db, input.user.sub, profile, current.version, input.now ?? Date.now())) {
      return { kind: 'disconnected', profile, version };
    }
  }
  const latest = await loadHuaweiProfile(input.db, input.user.sub);
  return {
    kind: 'conflict',
    profile: withProtectedFields(input.user, { ...latest.profile, version: latest.version }),
    version: latest.version,
  };
}
