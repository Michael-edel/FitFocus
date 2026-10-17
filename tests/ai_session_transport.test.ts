import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { prepareAiSession, postScopedAiJson, type AiSession } from '../services/aiSession';
import { callAiCouncil, generatePersonalPlan, generatePlateauExplanation, generateWeeklyMenu, getCoachAdvice } from '../geminiService';
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

it('requires an atomic projection capability for a personal menu action', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me()));
  await expect(prepareAiSession(account, new AbortController(), () => true,
    { outbox, fetchImpl, requireMenuProjection: true })).rejects.toThrow('PROTOCOL');
  expect(fetchImpl).toHaveBeenCalledOnce();
  fetchImpl.mockResolvedValue(json(me({ profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } })));
  await expect(prepareAiSession(account, new AbortController(), () => true,
    { outbox, fetchImpl, requireMenuProjection: true })).resolves.toMatchObject({ guard: { accountId: account } });
});

it('allows registration to bootstrap one session only when explicitly requested', async () => {
  const initialDb = new StateDatabase({ factory: new IDBFactory(), name: 'fitfocus-ai-initial-session' });
  const initialOutbox = new DurableOutbox(initialDb);
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(me()));
  try {
    await expect(prepareAiSession(account, new AbortController(), () => true, { outbox: initialOutbox, fetchImpl }))
      .rejects.toThrow('LOGIN_SESSION_CHANGED');
    expect(fetchImpl).not.toHaveBeenCalled();
    const session = await prepareAiSession(account, new AbortController(), () => true,
      { outbox: initialOutbox, fetchImpl, allowInitialSession: true });
    expect(session.guard).toMatchObject({ accountId: account, serverSessionId: sid });
    expect(fetchImpl).toHaveBeenCalledOnce();
  } finally {
    initialDb.close();
  }
});

it('does not allow an initial session to adopt a different account', async () => {
  const initialDb = new StateDatabase({ factory: new IDBFactory(), name: 'fitfocus-ai-initial-other-account' });
  const initialOutbox = new DurableOutbox(initialDb);
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...me(), user: { sub: 'different-account' },
    stateSync: { protocol: 2, guard: 1, accountId: 'different-account', sessionId: 'b'.repeat(64) } }));
  try {
    await expect(prepareAiSession(account, new AbortController(), () => true,
      { outbox: initialOutbox, fetchImpl, allowInitialSession: true })).rejects.toThrow('LOGIN_SESSION_CHANGED');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(await initialOutbox.sessionState()).toMatchObject({ active: undefined, fence: 0 });
  } finally {
    initialDb.close();
  }
});

it('does not adopt a login that races with initial registration proof', async () => {
  const initialDb = new StateDatabase({ factory: new IDBFactory(), name: 'fitfocus-ai-initial-session-race' });
  const initialOutbox = new DurableOutbox(initialDb);
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    await initialOutbox.acceptReadSession('racing-login', 'b'.repeat(64), (await initialOutbox.sessionState()).fence);
    return json(me());
  });
  try {
    await expect(prepareAiSession(account, new AbortController(), () => true,
      { outbox: initialOutbox, fetchImpl, allowInitialSession: true })).rejects.toThrow('LOGIN_SESSION_CHANGED');
    expect(await initialOutbox.sessionState()).toMatchObject({ active: { accountId: 'racing-login' }, fence: 1 });
  } finally {
    initialDb.close();
  }
});

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

it('generates coach advice only through the captured account/session scope', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : json({ text: JSON.stringify({ title: 'Сегодня', advice: 'Добавьте белок.', bullets: ['Творог'] }) }, headers()));
  const advice = await getCoachAdvice({ user: { id: account }, today: {} }, await prepare(fetchImpl));

  expect(advice).toEqual({ title: 'Сегодня', advice: 'Добавьте белок.', bullets: ['Творог'] });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe('/api/ai');
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(JSON.parse(String(init?.body)).feature).toBe('coach_advice');
});
it('generates the personal plan only through the captured account/session scope', async () => {
  const plan = { title: 'План', strategySummary: 'Регулярное питание.', weeklyFocus: 'Стабильный ритм.',
    dailyKpi: { calories: 1800, protein: 120, fat: 60, carbs: 190 }, rules: ['Белок в каждом приёме.'],
    firstTasks: ['Запланировать питание.'], mealTemplate: { breakfast: 'Каша.', lunch: 'Курица.', dinner: 'Рыба.', snack: 'Йогурт.' } };
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : json({ text: JSON.stringify(plan) }, headers()));
  const user = { id: account, name: 'Test', gender: 'MALE', age: 30, weight: 70, height: 175, activityLevel: 1.55,
    goal: Goal.LOSS } as UserProfile;

  expect((await generatePersonalPlan(user, await prepare(fetchImpl))).title).toBe('План');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe('/api/ai');
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(JSON.parse(String(init?.body)).feature).toBe('personal_plan');
});
it('generates the plateau explanation only through the captured account/session scope', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async url => String(url).startsWith('/api/me') ? json(me())
    : json({ text: 'Проверьте точность порций и сон.' }, headers()));

  expect(await generatePlateauExplanation({ weightDelta: 0, compliance: 0.82, newCalories: 1800 }, await prepare(fetchImpl)))
    .toBe('Проверьте точность порций и сон.');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe('/api/ai');
  expect(new Headers(init?.headers).get('X-FitFocus-State-Account')).toBe(account);
  expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sid);
  expect(JSON.parse(String(init?.body)).feature).toBe('plateau');
});
it('fails closed when an AI request reaches the proxy without a captured session', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  await expect(generatePlateauExplanation({ weightDelta: 0 }, undefined as unknown as AiSession))
    .rejects.toThrow('LOGIN_SESSION_CHANGED');
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('sends every AI Council expert request through the captured account/session scope', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).startsWith('/api/me')) return json(me());
    const payload = JSON.parse(String(init?.body)) as { feature: string };
    const text = payload.feature === 'council_chairman'
      ? 'Сводный ответ. Agreement Score: 90/100'
      : 'stance: approve\nscore: 90\nreason: проверено';
    return json({ text }, headers());
  });
  const user = { id: account, name: 'Test', gender: 'MALE', age: 30, height: 175, weight: 70,
    activityLevel: 1.55, goal: Goal.MAINTAIN } as UserProfile;

  const result = await callAiCouncil('Как улучшить режим питания?', user, [], [], await prepare(fetchImpl));
  const aiCalls = fetchImpl.mock.calls.filter(([url]) => String(url) === '/api/ai');

  expect(result.finalAnswer).toContain('Сводный ответ.');
  expect(aiCalls).toHaveLength(14);
  for (const [, init] of aiCalls) {
    const requestHeaders = new Headers(init?.headers);
    expect(requestHeaders.get('X-FitFocus-State-Account')).toBe(account);
    expect(requestHeaders.get('X-FitFocus-State-Session')).toBe(sid);
    expect((JSON.parse(String(init?.body)) as { feature: string }).feature).toMatch(/^council_/);
  }
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
