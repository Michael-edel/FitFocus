import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareAchievementSession, requestAchievementJson } from '../services/achievementSession';

const account = 'achievement-owner', sid = 'a'.repeat(64);
let db: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard;
const me = (extra: Record<string, unknown> = {}) => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, achievementSync: { protocol: 1, guard: 1 }, ...extra });
const headers = () => ({ 'Content-Type': 'application/json', 'X-FitFocus-Achievements-Protocol': '1',
  'X-FitFocus-Achievements-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
const json = (body: unknown, scope: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), { headers: scope, status });
const prepare = (fetchImpl: typeof fetch, controller = new AbortController()) =>
  prepareAchievementSession(guard, controller, () => true, { outbox, fetchImpl, timeoutMs: 200 });
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  guard = (await outbox.acceptReadSession(account, sid, 0))!;
});
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([undefined, { protocol: 1 }, { protocol: 2, guard: 1 }])('requires its own capability %j without requiring AI capabilities', async capability => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ achievementSync: capability })));
  await expect(prepare(fetchImpl)).rejects.toThrow('PROTOCOL'); expect(fetchImpl).toHaveBeenCalledOnce();
});
it.each(['other-account', 'same-account-login'])('does not adopt a %s cookie', async change => {
  const owner = change === 'other-account' ? 'another-owner' : account;
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ user: { sub: owner },
    stateSync: { protocol: 2, guard: 1, accountId: owner, sessionId: 'b'.repeat(64) } })));
  const before = await outbox.sessionState();
  await expect(prepare(fetchImpl)).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(await outbox.sessionState()).toEqual(before);
});
it.each([undefined, { hasWeeklyMenu: true, source: 'weekly_menu_generated' }])('scopes GET/POST and uses a single bounded transport attempt: %j', async context => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ catalog: [] }, headers()));
  expect((await requestAchievementJson(await prepare(fetchImpl), context)).response.ok).toBe(true);
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe(context ? '/api/achievements/check' : '/api/achievements');
  expect(init?.method).toBe(context ? 'POST' : 'GET');
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(init?.credentials).toBe('include'); expect(init?.cache).toBe('no-store'); expect(init?.redirect).toBe('error');
  if (context) expect(JSON.parse(String(init?.body))).toEqual({ context });
});
it.each(['Protocol', 'Guard', 'Account', 'Session'])('rejects the wrong response %s before publishing data', async field => {
  const scope: Record<string, string> = headers();
  scope[`X-FitFocus-${field === 'Protocol' || field === 'Guard' ? 'Achievements' : 'State'}-${field}`] = 'wrong';
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ catalog: [] }, scope));
  await expect(requestAchievementJson(await prepare(fetchImpl), {})).rejects.toThrow('PROTOCOL');
});
it('rejects a late response after another tab invalidates the IDB fence', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : new Promise<Response>(resolve => { release = resolve; }));
  const session = await prepare(fetchImpl);
  const result = expect(requestAchievementJson(session, {})).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  await outbox.invalidateSessions(); release(json({ newlyUnlocked: [{ key: 'old' }] }, headers())); await result;
});

it('an automatic proof already in flight cannot clear a newly established auth pause', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { release = resolve; }));
  const pending = prepare(fetchImpl);
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  const connection = await db.open();
  const tx = connection.transaction('outbox_meta', 'readwrite'), store = tx.objectStore('outbox_meta');
  const read = store.get('active-session'); read.onsuccess = () => store.put({ ...read.result, pause: 'auth' });
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  const paused = await outbox.sessionState();
  release(json(me()));
  await expect(pending).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(await outbox.sessionState()).toEqual(paused);
});
it('cancels a held body on pagehide even if the transport ignores AbortSignal', async () => {
  const target = new EventTarget(); vi.stubGlobal('window', target);
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: headers() }));
  const session = await prepare(fetchImpl);
  const result = expect(requestAchievementJson(session)).rejects.toThrow('STATE_REQUEST_ABORTED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2)); target.dispatchEvent(new Event('pagehide')); await result;
  expect(session.controller.signal.aborted).toBe(true);
});
it('times out a held body without retrying the mutation or cancelling the page lifetime', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : new Response(new ReadableStream({ start() {} }), { headers: headers() }));
  const session = await prepare(fetchImpl); session.timeoutMs = 25;
  await expect(requestAchievementJson(session, {})).rejects.toThrow('STATE_REQUEST_ABORTED');
  expect(session.controller.signal.aborted).toBe(false); expect(fetchImpl).toHaveBeenCalledTimes(2);
});
