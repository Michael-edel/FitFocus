import { withProtectedFields } from './legacy_sync';
import { loadActivePlan } from './plans';
import { writeProfileCas } from './profile_cas';
import { normalizeProfileRecord } from './profile_contract';
import { huaweiProviderId, loadHuaweiProfile, type HuaweiTokenSet } from './huawei_health';
import type { SessionUser } from './auth';
import type { JsonObject } from './json';

type EncryptedTokens = { accessTokenEnc: string; refreshTokenEnc: string | null };
export type HuaweiConnectResult = { kind: 'connected'; profile: JsonObject; version: number } | { kind: 'conflict'; profile: JsonObject; version: number };

/** Persists refreshed Huawei credentials and enables the profile integration with CAS. */
export async function connectHuaweiProfile(input: { db: D1Database; user: SessionUser; tokenSet: HuaweiTokenSet; encrypted: EncryptedTokens; nowSeconds: number; maxAttempts?: number }): Promise<HuaweiConnectResult> {
  const provider = huaweiProviderId();
  await input.db.prepare(
    "INSERT INTO wearable_connections (id, user_id, provider, access_token_enc, refresh_token_enc, token_type, scope, expires_at, created_at, updated_at, status, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?) ON CONFLICT(user_id, provider) DO UPDATE SET access_token_enc = excluded.access_token_enc, refresh_token_enc = COALESCE(excluded.refresh_token_enc, wearable_connections.refresh_token_enc), token_type = excluded.token_type, scope = excluded.scope, expires_at = excluded.expires_at, updated_at = excluded.updated_at, status = 'connected', metadata_json = excluded.metadata_json",
  ).bind(crypto.randomUUID(), input.user.sub, provider, input.encrypted.accessTokenEnc, input.encrypted.refreshTokenEnc, input.tokenSet.tokenType, input.tokenSet.scope, input.tokenSet.expiresAt, input.nowSeconds, input.nowSeconds, JSON.stringify({ connectedAt: new Date(input.nowSeconds * 1000).toISOString() })).run();
  const plan = await loadActivePlan(input.db, input.user.sub);
  const timestamp = new Date(input.nowSeconds * 1000).toISOString();
  for (let attempt = 0; attempt < (input.maxAttempts ?? 3); attempt += 1) {
    const current = await loadHuaweiProfile(input.db, input.user.sub);
    const version = current.version + 1;
    const profile = withProtectedFields(input.user, normalizeProfileRecord({ ...current.profile, plan, version, wearableProvider: provider, wearableEnabled: true, wearableConnectedAt: typeof current.profile.wearableConnectedAt === 'string' ? current.profile.wearableConnectedAt : timestamp, wearableLastSyncAt: timestamp }));
    if (await writeProfileCas(input.db, input.user.sub, profile, current.version, input.nowSeconds * 1000)) return { kind: 'connected', profile, version };
  }
  const latest = await loadHuaweiProfile(input.db, input.user.sub);
  return { kind: 'conflict', profile: withProtectedFields(input.user, { ...latest.profile, version: latest.version }), version: latest.version };
}
