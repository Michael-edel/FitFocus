import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StateDatabase, stateTransaction } from '../storage/stateDatabase';
import { DurableOutbox } from '../storage/durableOutbox';
import { UserStateRepository } from '../storage/userStateRepository';
import { StateSync } from '../storage/stateSync';
import { restoreProfile } from '../storage/profileState';
import { userProfile } from './_helpers/userProfile';
const account = 'account-a'; const sid = 'a'.repeat(64); const profile = userProfile(account);
const scope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid };
const json = (body: unknown, status = 200, headers: HeadersInit = scope) => new Response(JSON.stringify(body), { status, headers });
let db: StateDatabase; let outbox: DurableOutbox; let repo: UserStateRepository; let sync: StateSync;
beforeEach(async () => { db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  repo = new UserStateRepository(account, { outbox });
  const guard = (await outbox.acceptReadSession(account, sid, (await outbox.sessionState()).fence))!;
  await restoreProfile(repo, profile, guard); });
afterEach(() => { sync?.stop(); db.close(); vi.restoreAllMocks(); });
function client(mutation: typeof fetch, capability = true, options: { now?: () => number } = {}, projectionCapability = true) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => String(url) === '/api/me'
    ? json({ user: { sub: account }, hasAccess: true, stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
      ...(capability ? { profileSync: { protocol: 1, guard: 1, ...(projectionCapability ? { weeklyMenuProjection: 1 } : {}) } } : {}) }) : mutation(url, init));
  sync = new StateSync({ outbox, fetchImpl: fetchFn, legacyPending: () => false, ...options }); return fetchFn;
}
it('uses one finish time for an immediate auth pause even as the wall clock advances', async () => {
  await repo.writeJson('profile', profile); let clock = Date.now() + 1_000;
  client(async () => json({ error: 'UNAUTH' }, 401), true, { now: () => clock++ });
  await sync.connect(account); expect(await sync.syncNow(account)).toBe(false);
  expect((await outbox.list(account))[0]).toMatchObject({ status: 'pending', reason: 'auth' });
});
it('dispatches profile intents to the guarded profile endpoint with the observed CAS version', async () => {
  await repo.writeJson('profile', { ...profile, name: 'Локально' });
  const fetchFn = client(async () => json({ profile: { ...profile, name: 'Локально', version: 3 }, version: 3 }));
  await sync.connect(account); expect(await sync.syncNow(account)).toBe(true);
  const request = fetchFn.mock.calls.find(([url]) => String(url) === '/api/profile')!;
  expect(request[1]?.method).toBe('PUT'); expect(JSON.parse(request[1]!.body as string)).toMatchObject({ name: 'Локально', baseVersion: 2 });
  expect(new Headers(request[1]?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect((await outbox.snapshot(account, repo.key('profile'))).confirmedVersion).toBe(3);
});
it('retains a 409 payload and both snapshots without retrying with the server version', async () => {
  await repo.writeJson('profile', { ...profile, name: 'Локально' });
  const fetchFn = client(async () => json({ error: 'PROFILE_CONFLICT', profile: { ...profile, name: 'Облако', version: 8 }, version: 8 }, 409));
  await sync.connect(account); expect(await sync.syncNow(account)).toBe(false); await sync.flush();
  const [op] = await outbox.list(account);
  expect(op).toMatchObject({ status: 'conflicted', baseVersion: 2, resource: 'profile', serverSnapshot: { version: 8 } });
  expect(JSON.parse((op as { value: string }).value).name).toBe('Локально'); expect(JSON.parse(op.serverSnapshot!.value!).name).toBe('Облако');
  expect(fetchFn.mock.calls.filter(([url]) => String(url) === '/api/profile')).toHaveLength(1);
});
it.each(['missing-capability', 'missing-headers', 'wrong-account', 'wrong-version'])('does not acknowledge %s', async (fault) => {
  await repo.writeJson('profile', profile);
  const fetchFn = client(async () => json({ profile: { ...profile, id: fault === 'wrong-account' ? 'other' : account, version: 3 },
    version: fault === 'wrong-version' ? 4 : 3 }, 200, fault === 'missing-headers' ? {} : scope), fault !== 'missing-capability');
  await sync.connect(account); expect(await sync.syncNow(account)).toBe(false);
  expect(await outbox.list(account)).toHaveLength(1); expect((await outbox.sessionState()).active?.pause).toBe('protocol');
  if (fault === 'missing-capability') expect(fetchFn.mock.calls.some(([url]) => String(url) === '/api/profile')).toBe(false);
});
it.each([401, 403, 422, 429, 503])('retains the local intent after HTTP %s', async (status) => {
  await repo.writeJson('profile', { ...profile, name: 'Локально' });
  client(async () => json({ error: status === 403 ? 'ACCESS_REQUIRED' : 'error' }, status));
  await sync.connect(account); expect(await sync.syncNow(account)).toBe(false);
  expect(await outbox.list(account)).toHaveLength(1);
  expect(JSON.parse((await outbox.snapshot(account, repo.key('profile'))).value!).name).toBe('Локально');
});
it('does not hydrate over a pending edit or after a cross-tab logout', async () => {
  client(async () => { await repo.writeJson('profile', { ...profile, name: 'Новая правка' }); return json({ profile: { ...profile, version: 9 } }); });
  await sync.connect(account); expect(await sync.refreshProfile(account)).toBeNull();
  expect(JSON.parse((await outbox.snapshot(account, repo.key('profile'))).value!).name).toBe('Новая правка');
});
it('checks the session inside the hydration transaction', async () => {
  client(async () => { await outbox.invalidateSessions(); return json({ profile: { ...profile, version: 9 } }); });
  await sync.connect(account); expect(await sync.refreshProfile(account)).toBeNull();
  expect((await outbox.snapshot(account, repo.key('profile'))).confirmedVersion).toBe(2);
});
it('does not adopt a newer auth fence while refreshing a profile in the same epoch', async () => {
  client(async () => {
    const fence = (await outbox.sessionState()).fence;
    await stateTransaction(await db.open(), ['outbox_meta'], 'readwrite', tx => {
      tx.objectStore('outbox_meta').put({ id: 'auth-fence', revision: fence + 1 });
    });
    return json({ profile: { ...profile, version: 9 } });
  });
  await sync.connect(account); expect(await sync.refreshProfile(account)).toBeNull();
  expect((await outbox.snapshot(account, repo.key('profile'))).confirmedVersion).toBe(2);
});
it('applies a clean refresh without creating an outgoing operation', async () => {
  client(async () => json({ profile: { ...profile, name: 'Обновлённый профиль', version: 9 } }));
  await sync.connect(account); expect(JSON.parse((await sync.refreshProfile(account))!).name).toBe('Обновлённый профиль');
  expect(await outbox.list(account)).toEqual([]);
});
it('returns the read guard whose transaction accepted a clean profile refresh', async () => {
  client(async () => json({ profile: { ...profile, name: 'Обновлённый профиль', version: 9 } }));
  await sync.connect(account);
  const session = await outbox.sessionState();
  const refreshed = await sync.refreshProfileWithGuard(account);
  expect(refreshed).not.toBeNull();
  expect(JSON.parse(refreshed!.value).name).toBe('Обновлённый профиль');
  expect(refreshed!.readGuard).toMatchObject({
    accountId: account,
    serverSessionId: sid,
    sessionEpoch: session.active?.sessionEpoch,
    authFence: session.fence,
  });
  expect(await outbox.isReadSessionCurrent(refreshed!.readGuard)).toBe(true);
  expect((await outbox.snapshot(account, repo.key('profile'))).confirmedVersion).toBe(9);
});
it('keeps a pending profile without sending it when the projection capability is absent', async () => {
  await repo.writeJson('profile', { ...profile, name: 'Сохранено локально' });
  const fetchFn = client(async () => { throw new Error('Unexpected profile mutation'); }, true, {}, false);
  await sync.connect(account); expect(await sync.syncNow(account)).toBe(false);
  expect((await outbox.list(account))[0]).toMatchObject({ status: 'pending', reason: 'profile-protocol-required' });
  expect((await outbox.sessionState()).active?.pause).toBe('protocol');
  expect(fetchFn.mock.calls.some(([url]) => String(url) === '/api/profile')).toBe(false);
});
it('still accepts a guarded clean profile refresh without the projection write capability', async () => {
  const fetchFn = client(async () => json({ profile: { ...profile, name: 'Прочитано из облака', version: 9 } }), true, {}, false);
  await sync.connect(account);
  const refreshed = await sync.refreshProfile(account);
  expect(refreshed).not.toBeNull();
  expect(JSON.parse(refreshed!).name).toBe('Прочитано из облака');
  expect((await outbox.snapshot(account, repo.key('profile'))).confirmedVersion).toBe(9);
  expect(await outbox.list(account)).toEqual([]);
  expect(fetchFn.mock.calls.find(([url]) => String(url) === '/api/profile')?.[1]?.method ?? 'GET').toBe('GET');
});
