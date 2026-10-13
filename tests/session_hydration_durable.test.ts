import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateSessionFromCloud } from '../sessionHydration';
import { UserStateRepository } from '../storage/userStateRepository';
import { DurableOutbox } from '../storage/durableOutbox';
import { userStateDatabase } from '../storage/stateDatabase';
import type { UserProfile } from '../types';
import { userProfile } from './_helpers/userProfile';
import { sessionMe, sessionHeaders, testSessionId } from './_helpers/sessionRead';
import { restoreProfile } from '../storage/profileState';

vi.mock('../coach', () => ({ createTask: async (user: unknown) => user, requiresAiPlateauTask: () => false }));
const user = userProfile('hydration-account');
const key = `fitfocus_data_${user.id}_diary`;
const meal = (id: string) => [{ id, name: 'Суп', calories: 100, protein: 2, fat: 3, carbs: 4, timestamp: '2026-10-09T08:00:00Z' }];
const response = (items: unknown, protocol = '2') => new Response(JSON.stringify({ items }), {
  headers: protocol ? { ...sessionHeaders(user.id, 'state'), 'X-FitFocus-State-Protocol': protocol } : {},
});
const remote = (id: string) => ({ key, value: JSON.stringify(meal(id)), version: 4, exists: true });
const hydrate = (fetchImpl: typeof fetch) => hydrateSessionFromCloud(user, {
  fetchImpl: (url, init) => String(url).startsWith('/api/me') ? Promise.resolve(new Response(JSON.stringify(sessionMe(user.id)))) : fetchImpl(url, init),
  initialHabits: [], resetUsageIfNewTime: (u) => u,
});
beforeEach(async () => {
  userStateDatabase.close();
  vi.stubGlobal('indexedDB', new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { get length() { return values.size; }, clear: () => values.clear(),
    getItem: (k: string) => values.get(k) ?? null, key: (i: number) => [...values.keys()][i] ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } });
  const outbox = new DurableOutbox();
  const guard = (await outbox.acceptReadSession(user.id, testSessionId, (await outbox.sessionState()).fence))!;
  await restoreProfile(new UserStateRepository(user.id), user, guard);
});
afterEach(() => { userStateDatabase.close(); vi.unstubAllGlobals(); });

describe('cloud hydration with the runtime durable repository', () => {
  it.each([
    ['signed-out', { user: null, hasAccess: true }],
    ['access-denied', { ...sessionMe(user.id), hasAccess: false }],
    ['missing-capability', { user: { sub: user.id }, hasAccess: true }],
  ])('rejects %s proof even without an incoming read guard', async (_reason, body) => {
    const repository = new UserStateRepository(user.id);
    const outbox = new DurableOutbox();
    await repository.writeJson('diary', meal('owned-local'));
    const before = await outbox.snapshot(user.id, key);
    const operations = await outbox.list(user.id);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify(body)));
    await expect(hydrateSessionFromCloud(user, { fetchImpl,
      initialHabits: [], resetUsageIfNewTime: u => u })).rejects.toThrow('SESSION_READ_PROTOCOL');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/^\/api\/me\?/);
    expect(await outbox.snapshot(user.id, key)).toEqual(before);
    expect(await outbox.list(user.id)).toEqual(operations);
  });

  it('keeps owned local data available when session verification has a transport failure', async () => {
    const repository = new UserStateRepository(user.id);
    await repository.writeJson('diary', meal('owned-offline'));
    const operations = await new DurableOutbox().list(user.id);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => { throw new TypeError('Network unavailable'); });
    const hydrated = await hydrateSessionFromCloud(user, { fetchImpl,
      initialHabits: [], resetUsageIfNewTime: u => u });
    expect(hydrated.foodDiary).toEqual(meal('owned-offline'));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url]) => String(url).startsWith('/api/me?'))).toBe(true);
    expect(await new DurableOutbox().list(user.id)).toEqual(operations);
  });

  it.each([408, 429, 503])('keeps owned local data when /me is temporarily unavailable (%s)', async status => {
    const repository = new UserStateRepository(user.id);
    await repository.writeJson('diary', meal('owned-offline'));
    const operations = await new DurableOutbox().list(user.id);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify({ error: 'TEMPORARY' }), { status }));
    const hydrated = await hydrateSessionFromCloud(user, { fetchImpl,
      initialHabits: [], resetUsageIfNewTime: u => u });
    expect(hydrated.foodDiary).toEqual(meal('owned-offline'));
    expect(fetchImpl).toHaveBeenCalledTimes(status >= 500 ? 2 : 1);
    expect(fetchImpl.mock.calls.every(([url]) => String(url).startsWith('/api/me?'))).toBe(true);
    expect(await new DurableOutbox().list(user.id)).toEqual(operations);
  });

  it.each(['logout', 'account'])('rejects a snapshot when %s changes during state HTTP', async change => {
    const outbox = new DurableOutbox(); let began!: () => void; let release!: (value: Response) => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    const pending = hydrate(async () => { began(); return new Promise<Response>(resolve => { release = resolve; }); });
    const rejected = expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
    await started;
    if (change === 'logout') await outbox.invalidateSessions();
    else await outbox.acceptReadSession('account-b', 'b'.repeat(64), (await outbox.sessionState()).fence);
    release(response([remote('wrong-session')])); await rejected;
    expect(await outbox.snapshot(user.id, key)).toMatchObject({ value: null, revision: 0, confirmedVersion: 0 });
    expect((await outbox.sessionState()).active?.accountId).toBe(change === 'account' ? 'account-b' : undefined);
  });
  it('does not apply a late cloud snapshot after the login attempt was cancelled', async () => {
    let current = true;
    await expect(hydrateSessionFromCloud(user, { initialHabits: [], resetUsageIfNewTime: u => u,
      isCurrentSession: () => current, fetchImpl: async () => { current = false; return response([remote('late')]); } })).rejects.toThrow('LOGIN_SESSION_CHANGED');
    expect(await new DurableOutbox().snapshot(user.id, key)).toMatchObject({ value: null, revision: 0 });
  });
  it('hydrates additional managed keys while keeping device AI metadata local', async () => {
    const planKey = `fitfocus_data_${user.id}_plan_task_done`;
    const aiKey = `fitfocus_data_${user.id}_ai_gemini_status`;
    localStorage.setItem(aiKey, 'device status');
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => response([
      { key: planKey, value: '{"task":true}', exists: true, version: 8 },
      { key: aiKey, value: 'foreign status', exists: true, version: 12 },
    ]));
    const hydrated = await hydrate(fetchImpl);
    expect(await hydrated.repository!.readRawAsync('plan_task_done')).toBe('{"task":true}');
    expect(await new DurableOutbox().list(user.id)).toEqual([]);
    expect(localStorage.getItem(aiKey)).toBe('device status');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('prefix=ai_');
    expect(await hydrated.repository!.writeRaw('plan_task_done', '{"task":false}')).toMatchObject({ status: 'pending', baseVersion: 8 });
  });

  it('loads a clean protocol-2 snapshot and hands its actual editor revision to the app', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : []));
    const hydrated = await hydrate(fetchImpl);
    expect(hydrated.foodDiary).toEqual(meal('cloud'));
    expect(fetchImpl.mock.calls[0][0]).toContain('includeDeleted=1');
    expect(await hydrated.repository!.writeJson('diary', meal('local'))).toMatchObject({ status: 'pending', baseVersion: 4 });
  });

  it('does not overwrite a pending local snapshot with a bootstrap/cloud value', async () => {
    await new UserStateRepository(user.id).writeJson('diary', meal('local'));
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : []));
    expect(hydrated.foodDiary).toEqual(meal('local'));
    expect(await new DurableOutbox().list(user.id)).toHaveLength(1);
  });

  it('keeps pending deletion and its revision while cloud still returns the old live value', async () => {
    const repository = new UserStateRepository(user.id);
    await repository.writeJson('diary', meal('old'));
    await repository.remove('diary');
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : []));
    expect(hydrated.foodDiary).toEqual([]);
    expect((await new DurableOutbox().list(user.id)).find((op) => op.type === 'delete')).toMatchObject({ type: 'delete', status: 'pending' });
  });

  it('reads a tombstone generation and recreates by that version', async () => {
    const hydrated = await hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [{ key, value: '', version: 5, exists: false }] : []));
    expect(hydrated.foodDiary).toEqual([]);
    expect(await hydrated.repository!.writeJson('diary', meal('recreated'))).toMatchObject({ baseVersion: 5, status: 'pending' });
  });

  it('requires valid protocol-2 items before treating missing keys as absent', async () => {
    await expect(hydrate(async () => response(null))).rejects.toThrow('SESSION_READ_PROTOCOL');
    expect(await new DurableOutbox().snapshot(user.id, key)).toMatchObject({ revision: 0, confirmedVersion: 0 });
  });

  it('does not trust an old server or replace legacy local content', async () => {
    localStorage.setItem(key, JSON.stringify(meal('legacy')));
    const source = JSON.stringify([{ type: 'put', key, value: JSON.stringify(meal('legacy')) }]);
    localStorage.setItem('fitfocus.remote-kv-outbox.v1', source);
    await expect(hydrate(async (url) => response(String(url).includes('fitfocus_data_') ? [remote('cloud')] : [], ''))).rejects.toThrow('SESSION_READ_PROTOCOL');
    expect(localStorage.getItem(key)).toBe(JSON.stringify(meal('legacy')));
    expect(localStorage.getItem('fitfocus.remote-kv-outbox.v1')).toBe(source);
    expect(await new DurableOutbox().snapshot(user.id, key)).toMatchObject({ revision: 0 });
  });

  it('keeps a write that committed after the cloud request started', async () => {
    let release!: (r: Response) => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => { began = resolve; });
    const pending = hydrate(async (url) => {
      if (!String(url).includes('fitfocus_data_')) return response([]);
      began();
      return new Promise<Response>((resolve) => { release = resolve; });
    });
    await started;
    const editor = new UserStateRepository(user.id);
    await editor.readJsonAsync('diary', [], Array.isArray);
    await editor.writeJson('diary', meal('during-request'));
    release(response([remote('stale')]));
    expect((await pending).foodDiary).toEqual(meal('during-request'));
  });
});
