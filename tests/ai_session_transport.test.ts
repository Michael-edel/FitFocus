import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareAiSession, postScopedAiJson } from '../services/aiSession';
import { generateWeeklyMenu } from '../geminiService';
import { Goal, type UserProfile } from '../types';

const account = 'ai-owner', sid = 'a'.repeat(64);
let db: StateDatabase, outbox: DurableOutbox;
beforeEach(async () => {
  db = new StateDatabase({ factory: new IDBFactory() }); outbox = new DurableOutbox(db);
  await outbox.acceptReadSession(account, sid, 0);
});
afterEach(() => { db.close(); vi.restoreAllMocks(); });
const capabilities = { aiSync: { protocol: 1, guard: 1 }, weeklyMenuSync: { protocol: 1, guard: 1 } };
const me = (extra: Record<string, unknown> = {}) => ({ user: { sub: account }, hasAccess: true,
  stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid }, ...capabilities, ...extra });
const headers = (resource = 'AI') => ({ 'Content-Type': 'application/json',
  [`X-FitFocus-${resource}-Protocol`]: '1', [`X-FitFocus-${resource}-Guard`]: '1',
  'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid });
const json = (body: unknown, scope: HeadersInit = {}, status = 200) => new Response(JSON.stringify(body), { headers: scope, status });
const prepare = (fetchImpl: typeof fetch, controller = new AbortController()) =>
  prepareAiSession(account, controller, () => true, { outbox, fetchImpl, timeoutMs: 200 });

it.each(['aiSync', 'weeklyMenuSync'])('fails closed without %s capability', async name => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ [name]: undefined })));
  await expect(prepare(fetchImpl).then(session => postScopedAiJson(session, '/api/ai', {}))).rejects.toThrow('PROTOCOL');
  expect(fetchImpl).toHaveBeenCalledOnce();
});
it.each(['other-account', 'same-account-login'])('does not adopt a %s cookie during the original action', async change => {
  const before = await outbox.sessionState();
  const owner = change === 'other-account' ? 'another-owner' : account;
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me({ user: { sub: owner },
    stateSync: { protocol: 2, guard: 1, accountId: owner, sessionId: 'b'.repeat(64) } })));
  await expect(prepare(fetchImpl)).rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(await outbox.sessionState()).toEqual(before); expect(fetchImpl).toHaveBeenCalledOnce();
});
it('rejects an explicitly aborted /me as a changed action without accepting its late proof', async () => {
  const before = await outbox.sessionState();
  const controller = new AbortController();
  let release!: (response: Response) => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  // Even a transport that ignores AbortSignal must not keep the action pending or accept its proof.
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { release = resolve; started(); }));
  const rejected = expect(prepare(fetchImpl, controller)).rejects.toMatchObject({ kind: 'session', message: 'LOGIN_SESSION_CHANGED' });
  await began; controller.abort(); await rejected;
  release(json(me()));
  await Promise.resolve();
  expect(await outbox.sessionState()).toEqual(before);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
it('sends the captured proof and returns a scoped response', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ text: 'Menu' }, headers()));
  const session = await prepare(fetchImpl);
  expect((await postScopedAiJson(session, '/api/ai', { feature: 'weekly_menu' })).body).toEqual({ text: 'Menu' });
  const init = fetchImpl.mock.calls[1][1]!;
  expect(new Headers(init.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(init.credentials).toBe('include'); expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
});
it.each(['protocol', 'guard', 'account', 'session'])('rejects a response with the wrong %s', async change => {
  const scope = headers(); const name = { protocol: 'X-FitFocus-AI-Protocol', guard: 'X-FitFocus-AI-Guard',
    account: 'X-FitFocus-State-Account', session: 'X-FitFocus-State-Session' }[change]!;
  scope[name] = 'wrong';
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : json({ text: 'wrong' }, scope));
  await expect(postScopedAiJson(await prepare(fetchImpl), '/api/ai', {})).rejects.toThrow('PROTOCOL');
});
it('aborts a held response body rather than only waiting for headers', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : new Response(new ReadableStream({ start() {} }), { headers: headers() }));
  const session = await prepare(fetchImpl);
  const rejected = expect(postScopedAiJson(session, '/api/ai', {})).rejects.toThrow('STATE_REQUEST_ABORTED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2)); session.controller.abort(); await rejected;
});
it('times out a request without aborting the page action so the UI can report failure and retry', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : new Response(new ReadableStream({ start() {} }), { headers: headers() }));
  const session = await prepare(fetchImpl);
  session.timeoutMs = 25;
  await expect(postScopedAiJson(session, '/api/ai', {})).rejects.toThrow('STATE_REQUEST_ABORTED');
  expect(session.controller.signal.aborted).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  fetchImpl.mockResolvedValue(json({ text: 'Retried menu' }, headers()));
  expect((await postScopedAiJson(session, '/api/ai', {})).body?.text).toBe('Retried menu');
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
it('rechecks the IDB fence after a delayed response', async () => {
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me()) : new Promise<Response>(resolve => { release = resolve; }));
  const session = await prepare(fetchImpl);
  const rejected = expect(postScopedAiJson(session, '/api/ai', {})).rejects.toThrow('LOGIN_SESSION_CHANGED');
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  await outbox.invalidateSessions(); release(json({ text: 'old' }, headers())); await rejected;
});
it('generates through the captured proof without a hidden items write', async () => {
  let aiCalls = 0;
  const fetchImpl = vi.fn<typeof fetch>(async url => {
    if (String(url).startsWith('/api/me')) return json(me());
    aiCalls += 1;
    return json({ text: '{"days":[],"shoppingListItems":[]}' }, headers());
  });
  const user = { id: account, name: 'Test', gender: 'MALE', age: 30, weight: 70, height: 175, activityLevel: 1.55,
    goal: Goal.LOSS, aiPlan: { title: 'Plan', dailyKpi: { calories: 1800, protein: 120, fat: 60, carbs: 190 } } } as UserProfile;
  expect((await generateWeeklyMenu(user, user.aiPlan!, await prepare(fetchImpl))).days).toHaveLength(7);
  expect(aiCalls).toBe(1);
  for (const [url, init] of fetchImpl.mock.calls.slice(1)) {
    expect(url).toBe('/api/ai'); expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  }
});

it('does not retry an unavailable default model or fall back to an unscoped request', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : json({ error: { message: 'model not found' } }, headers(), 404));
  const user = { id: account, name: 'Test', aiPlan: { dailyKpi: {} } } as UserProfile;
  await expect(generateWeeklyMenu(user, user.aiPlan!, await prepare(fetchImpl))).rejects.toThrow('model not found');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
