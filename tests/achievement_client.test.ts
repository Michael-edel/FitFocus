import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { AchievementClient, type AchievementSnapshot } from '../features/achievements/achievementClient';

const account = 'achievement-owner', sid = 'a'.repeat(64);
const item = { key: 'welcome', tier: 'bronze', category: 'profile', title: 'Welcome', description: 'Test', unlocked_at: 123 };
let db: StateDatabase, outbox: DurableOutbox, current: boolean, states: AchievementSnapshot[], clients: AchievementClient[], storage: Map<string, string>;
let loginGuard: OutboxReadGuard;
const headers = () => ({ 'Content-Type': 'application/json', 'X-FitFocus-Achievements-Protocol': '1',
  'X-FitFocus-Achievements-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
const json = (body: unknown, scope: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), { headers: scope, status });
const me = () => json({ user: { sub: account }, hasAccess: true, stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, achievementSync: { protocol: 1, guard: 1 } });
const success = () => json({ enabled: true, catalog: [item], unlocked: [], newlyUnlocked: [item] }, headers());
const client = (fetchImpl: typeof fetch, getContext = () => ({ hasWeeklyMenu: true })) => {
  const value = new AchievementClient({ accountId: account, loginGuard, isCurrentSession: () => current, outbox, fetchImpl, timeoutMs: 200,
    getContext, onChange: state => states.push(state) });
  clients.push(value); value.activate(); return value;
};
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  loginGuard = (await outbox.acceptReadSession(account, sid, 0))!; current = true; states = []; clients = []; storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { clients.forEach(value => value.invalidate()); db.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const transport = () => vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? me() : success());

it('loads and unlocks through scoped HTTP, retaining the original producer context', async () => {
  const fetchImpl = transport(); const value = client(fetchImpl);
  await value.load(); expect(states.at(-1)?.catalog).toEqual([item]); expect(states.at(-1)?.loading).toBe(false);
  expect(await value.check('weekly_menu_generated')).toEqual([item]);
  const post = fetchImpl.mock.calls.find(([url]) => url === '/api/achievements/check')!;
  expect(JSON.parse(String(post[1]?.body))).toEqual({ context: { hasWeeklyMenu: true, source: 'weekly_menu_generated' } });
  expect(states.at(-1)?.newlyUnlocked).toEqual([item]);
});
it.each(['account', 'same-account-login'])('drops queued checks after another tab changes %s without adopting its new scope', async change => {
  const fetchImpl = transport(); const value = client(fetchImpl);
  await value.check('app_open');
  const pending = value.check('ai_photo_success');
  await outbox.invalidateSessions();
  const { fence } = await outbox.sessionState();
  await outbox.acceptReadSession(change === 'account' ? 'other' : account, 'b'.repeat(64), fence);
  expect(await pending).toEqual([]);
  expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/achievements/check')).toHaveLength(1);
  expect(storage.size).toBe(0);
});
it('settles every queued resolver on page/login cleanup and old producers cannot send later', async () => {
  const fetchImpl = transport(); const value = client(fetchImpl); await value.check('app_open');
  const first = value.check('ai_photo_success'), second = value.check('weekly_menu_generated');
  value.invalidate(); expect(await first).toEqual([]); expect(await second).toEqual([]);
  expect(await value.check('pdf_report_generated')).toEqual([]);
  await new Promise(resolve => setTimeout(resolve, 550));
  expect(fetchImpl.mock.calls.filter(([url]) => url === '/api/achievements/check')).toHaveLength(1);
  expect(storage.size).toBe(0);
});
it.each(['load', 'check'])('ignores a held %s response after the original login expires', async action => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? me() : new Promise<Response>(resolve => { release = resolve; }));
  const value = client(fetchImpl); const request = action === 'load' ? value.load() : value.check('weekly_menu_generated');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  current = false; const before = [...states]; release(success()); await request;
  expect(states).toEqual(before);
  expect(states.at(-1)?.newlyUnlocked).toEqual([]);
});
it('aborts held proof before POST and settles the caller during cleanup', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { release = resolve; }));
  const value = client(fetchImpl); const pending = value.check('weekly_menu_generated');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce()); value.invalidate();
  expect(await pending).toEqual([]); release(me());
  await new Promise(resolve => setTimeout(resolve, 25));
  expect(fetchImpl).toHaveBeenCalledOnce(); expect(states.at(-1)?.newlyUnlocked).toEqual([]);
});
it('coalesces a reason with the latest enqueue snapshot, not the later live context', async () => {
  const fetchImpl = transport(); let context = { hasWeeklyMenu: false }; const value = client(fetchImpl, () => context);
  await value.check('app_open');
  const first = value.check('weekly_menu_generated', { hasWeeklyMenu: true });
  const second = value.check('weekly_menu_generated', { hasWeeklyMenu: false });
  context = { hasWeeklyMenu: true };
  expect(await first).toEqual([item]); expect(await second).toEqual([item]);
  const posts = fetchImpl.mock.calls.filter(([url]) => url === '/api/achievements/check');
  expect(posts).toHaveLength(2);
  expect(JSON.parse(String(posts[1][1]?.body)).context.hasWeeklyMenu).toBe(false);
});
it('caps distinct queued reasons and resolves the dropped callers', async () => {
  const fetchImpl = transport(); const value = client(fetchImpl); await value.check('app_open');
  const dropped = value.check('ai_photo_success');
  const pending = (['log_weight', 'measurement_saved', 'weekly_menu_generated', 'ai_coach_success', 'pdf_report_generated'] as const).map(reason => value.check(reason));
  expect(await dropped).toEqual([]); value.invalidate(); expect(await Promise.all(pending)).toEqual([[], [], [], [], []]);
  expect(storage.size).toBe(0);
});
it('a failed POST is not retried and produces no unlock', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? me() : json({ error: 'unavailable' }, headers(), 503));
  const value = client(fetchImpl);
  expect(await value.check('weekly_menu_generated')).toEqual([]);
  expect(fetchImpl).toHaveBeenCalledTimes(2); expect(states.at(-1)?.newlyUnlocked).toEqual([]);
});

it('a restored page cannot adopt a newer same-account login already present in IDB', async () => {
  await outbox.invalidateSessions(); const { fence } = await outbox.sessionState();
  await outbox.acceptReadSession(account, 'b'.repeat(64), fence);
  const fetchImpl = transport(); const value = client(fetchImpl);
  await value.load(); expect(await value.check('weekly_menu_generated')).toEqual([]);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(states.at(-1)?.newlyUnlocked).toEqual([]);
});

it('does not reauthorize an auth pause but allows a new attempt after explicit same-login resume', async () => {
  const connection = await db.open();
  const tx = connection.transaction('outbox_meta', 'readwrite'), store = tx.objectStore('outbox_meta');
  const read = store.get('active-session'); read.onsuccess = () => store.put({ ...read.result, pause: 'auth' });
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  const fetchImpl = transport(); const value = client(fetchImpl);
  expect(await value.check('app_open')).toEqual([]); expect(fetchImpl).not.toHaveBeenCalled();
  const before = await outbox.sessionState(); await outbox.acceptReadSession(account, sid, before.fence);
  expect(await value.check('weekly_menu_generated')).toEqual([item]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('a GET started before a successful check cannot erase its unlock on late completion', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? me()
    : url === '/api/achievements' ? new Promise<Response>(resolve => { release = resolve; }) : success());
  const value = client(fetchImpl), loading = value.load();
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  expect(await value.check('weekly_menu_generated')).toEqual([item]);
  release(json({ enabled: true, catalog: [item], unlocked: [] }, headers())); await loading;
  expect(states.at(-1)?.unlocked).toEqual([expect.objectContaining({ key: 'welcome' })]);
  expect(states.at(-1)?.newlyUnlocked).toEqual([item]);
});
