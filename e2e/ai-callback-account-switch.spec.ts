import { expect, type BrowserContext, type Page } from '@playwright/test';
import { test } from './support/mockTest';
import { buildMockProfile, mockApp, openApp } from './support/appHarness';

const accountA = { id: 'ai-callback-account-a', sid: 'a'.repeat(64) };
const accountB = { id: 'ai-callback-account-b', sid: 'b'.repeat(64) };
// Keep held AI responses inside the 12-second session transport deadline.
const MAX_HELD_AI_RESPONSE_MS = 11_900;
const aiActionKey = (accountId: string) => `fitfocus_data_${accountId}_ai_last_action_v1`;
const profileKey = (accountId: string) => `fitfocus_data_${accountId}_profile`;
const coachKey = (accountId: string) => `fitfocus_data_${accountId}_last_coach_card`;
const diaryKey = (accountId: string) => `fitfocus_data_${accountId}_diary`;
const historyKey = (accountId: string) => `fitfocus_data_${accountId}_history`;
const councilKey = (accountId: string) => `fitfocus_data_${accountId}_council_history`;
const weeklyReportsKey = (accountId: string) => `fitfocus_data_${accountId}_weekly_reports`;
const recipeUsageKey = (accountId: string) => `fitfocus_usage_counters_v1:${encodeURIComponent(accountId)}`;

type Account = typeof accountA;
type Feature = 'coach_advice' | 'plateau' | 'personal_plan' | 'weekly_menu' | 'wis_text' | 'foodphoto' | 'foodphoto_enhanced' | 'recipe' | 'council_chairman';
type StateWriteAttempt = { account?: string; session?: string; keys: string[] };
type FixtureState = {
  current: Account;
  profile: ReturnType<typeof profileFor>;
  stateWriteLog?: StateWriteAttempt[];
  holdStateWriteFailures?: { key: string; active: boolean; retryAfterSeconds?: number };
};

function profileFor(accountId: string, plateau = false) {
  const profile = buildMockProfile();
  return {
    ...profile,
    id: accountId,
    googleSub: accountId,
    name: accountId === accountA.id ? 'Профиль A' : 'Профиль B',
    email: `${accountId}@example.test`,
    plan: 'pro',
    usage: { aiCoachCount: 0, aiFoodPhotoCount: 0, familyMenuCount: 0 },
    weightHistory: plateau
      ? Array.from({ length: 28 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (27 - index));
        return { date: date.toISOString().slice(0, 10), weight: 72 };
      })
      : profile.weightHistory,
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

function scopedHeaders(account: Account) {
  return {
    'X-FitFocus-State-Account': account.id,
    'X-FitFocus-State-Session': account.sid,
    'X-FitFocus-State-Protocol': '2',
    'X-FitFocus-State-Guard': '1',
    'X-FitFocus-Bootstrap-Protocol': '1',
    'X-FitFocus-Bootstrap-Guard': '1',
    'X-FitFocus-AI-Protocol': '1',
    'X-FitFocus-AI-Guard': '1',
    'X-FitFocus-Profile-Protocol': '1',
    'X-FitFocus-Profile-Guard': '1',
    'X-FitFocus-Achievements-Protocol': '1',
    'X-FitFocus-Achievements-Guard': '1',
    'X-FitFocus-Huawei-Protocol': '1',
    'X-FitFocus-Huawei-Guard': '1',
    'X-FitFocus-Push-Protocol': '1',
    'X-FitFocus-Push-Guard': '1',
    'X-FitFocus-Weekly-Menu-Protocol': '1',
    'X-FitFocus-Weekly-Menu-Guard': '1',
  };
}

function apiBody(account: Account, profile: ReturnType<typeof profileFor>) {
  return {
    user: { sub: account.id, roles: ['user'] },
    hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId: account.id, sessionId: account.sid },
    bootstrapSync: { protocol: 1, guard: 1 },
    profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 },
    aiSync: { protocol: 1, guard: 1 },
    weeklyMenuSync: { protocol: 1, guard: 1 },
    achievementSync: { protocol: 1, guard: 1 },
    huaweiSync: { protocol: 1, guard: 1 },
    pushSync: { protocol: 1, guard: 1 },
    profile,
  };
}

async function installAccountApi(page: Page, state: FixtureState, heldFeature?: Feature, heldHuaweiSync = false) {
  const held = deferred();
  const heldHuawei = deferred();
  const counts = {
    heldRequests: 0,
    heldStartedAtMs: 0,
    releasedResponses: 0,
    achievementChecks: 0,
    completedAiFeatures: [] as string[],
    aiRequests: [] as Array<{ feature: string; account?: string; session?: string }>,
    stateWrites: [] as string[],
    profileWrites: [] as string[],
    huaweiSyncRequests: [] as Array<{ account?: string; session?: string }>,
    huaweiSyncResponses: 0,
  };
  await mockApp(page, { session: 'app' });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const requestedAccount = request.headers()['x-fitfocus-state-account'];
    const requestedSession = request.headers()['x-fitfocus-state-session'];
    const responseAccount = requestedAccount && requestedSession
      ? { id: requestedAccount, sid: requestedSession }
      : state.current;
    const json = (body: unknown, account = state.current, extraHeaders: Record<string, string> = {}) => route.fulfill({
      contentType: 'application/json',
      headers: { ...scopedHeaders(account), ...extraHeaders },
      body: JSON.stringify(body),
    });

    if (path === '/api/env') return json({ requireInvite: false });
    if (path === '/api/me' && method === 'GET') return json(apiBody(state.current, state.profile));
    if (path === '/api/bootstrap' && method === 'GET') return json({
      user: { sub: state.current.id }, profile: state.profile, items: [],
    });
    if (path === '/api/state' && method === 'GET') return json({ items: [] }, responseAccount);
    if (path === '/api/state' && method === 'PUT') {
      const items = (request.postDataJSON()?.items ?? []) as Array<{ key: string; baseVersion: number }>;
      const keys = items.map(item => item.key);
      counts.stateWrites.push(...keys);
      state.stateWriteLog?.push({ account: requestedAccount, session: requestedSession, keys });
      if (state.holdStateWriteFailures?.active && keys.includes(state.holdStateWriteFailures.key)) {
        return route.fulfill({ status: 503, contentType: 'application/json',
          headers: { ...scopedHeaders(responseAccount), 'Retry-After': String(state.holdStateWriteFailures.retryAfterSeconds ?? 1) },
          body: JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }) });
      }
      return json({ ok: true, items: items.map(item => ({
        key: item.key, version: item.baseVersion + 1, exists: true,
      })) }, responseAccount);
    }
    if (path === '/api/profile') {
      if (method === 'PUT') {
        const body = request.postDataJSON() as Record<string, unknown>;
        counts.profileWrites.push(requestedAccount ?? 'missing');
        state.profile = { ...state.profile, ...body, version: Number(body.baseVersion ?? 0) + 1 };
      }
      return json({ profile: state.profile, version: state.profile.version }, responseAccount);
    }
    if (path === '/api/achievements' || path === '/api/achievements/check') {
      if (path.endsWith('/check')) counts.achievementChecks += 1;
      return json({ enabled: false, catalog: [], unlocked: [], newlyUnlocked: [] }, responseAccount);
    }
    if (path === '/api/logout') return json({ ok: true }, responseAccount);
    if (path === '/api/wearable/huawei/status' && method === 'GET') return json({
      configured: true, connected: true, status: 'connected', scope: 'health.read', expiresAt: null, lastSyncAt: null,
    }, responseAccount);
    if (path === '/api/wearable/huawei/sync' && method === 'POST') {
      const requestAccount = requestedAccount && requestedSession
        ? { id: requestedAccount, sid: requestedSession }
        : state.current;
      counts.huaweiSyncRequests.push({ account: requestedAccount, session: requestedSession });
      if (heldHuaweiSync) await heldHuawei.promise;
      const profile = { ...profileFor(requestAccount.id), wearableProvider: 'huawei_health', wearableEnabled: true,
        wearableStepsToday: 4321, version: 2 };
      const response = await json({ profile, updatedFields: ['wearableStepsToday'], version: 2 }, requestAccount);
      counts.huaweiSyncResponses += 1;
      return response;
    }
    if (path === '/api/ai' && method === 'POST') {
      const feature = request.postDataJSON()?.feature;
      if (typeof feature === 'string') counts.aiRequests.push({ feature, account: requestedAccount, session: requestedSession });
      if (feature === heldFeature) {
        expect(requestedAccount).toBe(accountA.id);
        expect(requestedSession).toBe(accountA.sid);
        counts.heldRequests += 1;
        counts.heldStartedAtMs = Date.now();
        await held.promise;
        const text = feature === 'coach_advice'
          ? JSON.stringify({ title: 'Поздний ответ A', advice: 'Совет профиля A', bullets: ['Старые данные'] })
          : feature === 'council_chairman'
            ? 'Поздний ответ AI Совета из аккаунта A'
          : feature === 'personal_plan'
            ? JSON.stringify({ ...profileFor(accountA.id).aiPlan, title: 'Поздний план A' })
            : feature === 'weekly_menu'
              ? JSON.stringify({
                days: Array.from({ length: 7 }, (_, index) => ({
                  day: `День ${index + 1}`,
                  breakfast: 'Позднее меню A',
                  lunch: 'Поздний обед A',
                  dinner: 'Поздний ужин A',
                  snack: 'Поздний перекус A',
                })),
                shoppingList: ['Поздний продукт A'],
                shoppingListItems: [{ name: 'Поздний продукт A', grams: 700 }],
              })
              : feature === 'foodphoto'
                ? JSON.stringify({
                  name: 'Поздняя еда A', nonFood: false, calories: 412, protein: 24, fat: 18, carbs: 39,
                  ingredients: [{ name: 'Старые данные A', percent: 100 }], notes: ['Поздний анализ аккаунта A'],
                })
                : feature === 'foodphoto_enhanced'
                  ? JSON.stringify({
                    name: 'Поздний рецепт A', calories: 412, protein: 24, fat: 18, carbs: 39,
                    ingredients: [{ name: 'Ингредиент аккаунта A', amount: '100 г' }],
                    notes: ['Поздний анализ рецепта'], portionGrams: 200, modelConfidence: 0.95,
                  })
                : feature === 'recipe'
                  ? JSON.stringify({
                    title: 'Поздний пошаговый рецепт A', servings: 2, timeMinutes: 15,
                    ingredients: [{ name: 'Ингредиент аккаунта A', amount: '100 г' }],
                    steps: [{ n: 1, text: 'Старый ответ аккаунта A', timeMin: 5 }], tips: [],
                  })
                  : feature === 'wis_text'
                    ? 'Поздний отчёт недели из аккаунта A'
                  : 'Позднее объяснение плато из профиля A';
        await json({ text }, accountA);
        counts.releasedResponses += 1;
        return;
      }
      const text = feature === 'foodphoto'
        ? JSON.stringify({
          name: 'Тестовый омлет', nonFood: false, calories: 320, protein: 23, fat: 21, carbs: 4,
          ingredients: [{ name: 'Яйца', percent: 70 }], notes: ['Оценка по фото'],
        })
        : feature === 'foodphoto_enhanced'
          ? JSON.stringify({
            name: 'Тестовый рецепт', calories: 320, protein: 23, fat: 21, carbs: 4,
            ingredients: [{ name: 'Яйца', amount: '100 г' }], notes: [], portionGrams: 200, modelConfidence: 0.95,
          })
          : feature === 'recipe'
            ? JSON.stringify({
              title: 'Пошаговый тестовый рецепт', servings: 2, timeMinutes: 15,
              ingredients: [{ name: 'Яйца', amount: '100 г' }],
              steps: [{ n: 1, text: 'Приготовить блюдо', timeMin: 5 }], tips: [],
            })
          : 'Тестовая интерпретация недели.';
      await json({ text }, responseAccount);
      if (typeof feature === 'string') counts.completedAiFeatures.push(feature);
      return;
    }
    return route.fallback();
  });
  return { counts, release: held.release, releaseHuawei: heldHuawei.release };
}

type StoredValue = { key: string; value: string };
type StoredOperation = {
  opId: string; accountId: string; key: string; status: string; resource?: string; value?: string;
  retryCount: number; nextAttemptAtMs: number; reason?: string;
};
type DurableSnapshot = {
  values: StoredValue[];
  operations: StoredOperation[];
  activeSession: { accountId: string; serverSessionId?: string; sessionEpoch: string } | null;
};

async function readDurableSnapshot(page: Page, retry = 0): Promise<DurableSnapshot> {
  try {
    const result = await page.evaluate(async () => {
      try {
        const opening = indexedDB.open('fitfocus-user-state-v1');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          opening.onsuccess = () => resolve(opening.result);
          opening.onerror = () => reject(opening.error);
        });
        try {
          const tx = db.transaction(['values', 'outbox', 'outbox_meta'], 'readonly');
          const complete = new Promise<void>((resolve, reject) => {
            tx.addEventListener('complete', () => resolve(), { once: true });
            tx.addEventListener('abort', () => reject(tx.error), { once: true });
          });
          const read = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const [values, operations, metadata] = await Promise.all([
            read(tx.objectStore('values').getAll()),
            read(tx.objectStore('outbox').getAll()),
            read(tx.objectStore('outbox_meta').getAll()),
          ]);
          await complete;
          const session = metadata.find((item: { id: string }) => item.id === 'active-session');
          return {
            ok: true as const,
            snapshot: {
              values: values.map((item: { key: string; value: string }) => ({ key: item.key, value: item.value })),
              operations: operations.map((item: StoredOperation) => ({
                opId: item.opId, accountId: item.accountId, key: item.key, status: item.status,
                resource: item.resource, value: item.value, retryCount: item.retryCount,
                nextAttemptAtMs: item.nextAttemptAtMs, reason: item.reason,
              })),
              activeSession: session ? {
                accountId: session.accountId, serverSessionId: session.serverSessionId, sessionEpoch: session.sessionEpoch,
              } : null,
            },
          };
        } finally {
          db.close();
        }
      } catch (error) {
        return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
      }
    });
    if (!result.ok) throw new Error(result.message);
    return result.snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const transientIdbOpenError = /UnknownError|operation failed for reasons unrelated to the database itself/i.test(message);
    if (retry < 2 && transientIdbOpenError) {
      await page.waitForTimeout(25 * (retry + 1));
      return readDurableSnapshot(page, retry + 1);
    }
    throw error;
  }
}

function rawValue(snapshot: DurableSnapshot, key: string) {
  return snapshot.values.find(value => value.key === key)?.value ?? null;
}

function operationsFor(snapshot: DurableSnapshot, account: Account) {
  return snapshot.operations.filter(operation => operation.accountId === account.id
    && [profileKey(account.id), coachKey(account.id), diaryKey(account.id), historyKey(account.id), councilKey(account.id)].includes(operation.key));
}

function valuesFor(snapshot: DurableSnapshot, account: Account) {
  return snapshot.values.filter(value => [profileKey(account.id), coachKey(account.id), diaryKey(account.id), historyKey(account.id), councilKey(account.id)].includes(value.key));
}

async function waitForAccountOutboxIdle(page: Page, account: Account) {
  await expect.poll(async () => operationsFor(await readDurableSnapshot(page), account), { timeout: 15_000 }).toEqual([]);
}

async function waitForAccountSwitch(page: Page) {
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);
  const snapshot = await readDurableSnapshot(page);
  expect(snapshot.activeSession?.serverSessionId).toBe(accountB.sid);
  return snapshot;
}

async function openAccountB(context: BrowserContext, state: FixtureState, waitForProfile = true) {
  state.current = accountB;
  state.profile = profileFor(accountB.id);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      errors.push(`${message.type()}: ${message.text()} @ ${JSON.stringify(message.location())}`);
    }
  });
  const fixture = await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountSwitch(page);
  if (waitForProfile) {
    await expect.poll(async () => rawValue(await readDurableSnapshot(page), profileKey(accountB.id))).not.toBeNull();
  }
  return { page, errors, fixture };
}

test('held coach retry cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const profileA = profileFor(accountA.id);
  const state: FixtureState = { current: accountA, profile: profileA };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      errorsA.push(`${message.type()}: ${message.text()} @ ${JSON.stringify(message.location())}`);
    }
  });
  const fixtureA = await installAccountApi(page, state, 'coach_advice');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  await page.evaluate(({ key, accountId }) => {
    localStorage.setItem(key, JSON.stringify({ feature: 'coach_advice', type: 'coach', userId: accountId, actionId: 'seeded-coach' }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });
  const retry = page.getByRole('button', { name: 'Retry: Coach', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  await retry.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const settledBeforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(settledBeforeSwitch, profileKey(accountA.id));
  const coachABefore = rawValue(settledBeforeSwitch, coachKey(accountA.id));
  const valuesABefore = valuesFor(settledBeforeSwitch, accountA);
  const operationsABefore = operationsFor(settledBeforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;

  try {
    const switched = await openAccountB(context, state);
    await expect(switched.page.getByRole('button', { name: 'Retry: Coach', exact: true })).toHaveCount(0);
    const accountBBefore = await readDurableSnapshot(switched.page);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);
    const profileBBefore = rawValue(accountBBefore, profileKey(accountB.id));
    const coachBBefore = rawValue(accountBBefore, coachKey(accountB.id));
    const valuesBBefore = valuesFor(accountBBefore, accountB);
    const operationsBBefore = operationsFor(accountBBefore, accountB);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(rawValue(final, coachKey(accountA.id))).toBe(coachABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(rawValue(final, coachKey(accountB.id))).toBe(coachBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(await page.getByText('Поздний ответ A', { exact: true }).count()).toBe(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('coach-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('AI Council uses account A proof and discards its held answer after account B signs in', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The two-tab AI Council account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()} @ ${JSON.stringify(message.location())}`);
  });
  const fixtureA = await installAccountApi(page, state, 'council_chairman');
  await openApp(page, '/#council');
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByRole('heading', { name: 'AI Совет Экспертов' })).toBeVisible();
  const question = 'Как улучшить режим питания?';
  await page.getByPlaceholder('Ваш вопрос экспертам...').fill(question);
  await page.locator('form').getByRole('button').click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await waitForAccountOutboxIdle(page, accountA);
  const beforeSwitch = await readDurableSnapshot(page);
  const councilA = rawValue(beforeSwitch, councilKey(accountA.id));
  expect(councilA).toContain(question);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);

  try {
    const switched = await openAccountB(context, state, false);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, councilKey(accountA.id))).toBe(councilA);
    expect(operationsFor(final, accountA)).toEqual(operationsFor(beforeSwitch, accountA));
    expect(fixtureA.counts.aiRequests.filter(call => call.feature.startsWith('council_')))
      .toEqual([{ feature: 'council_chairman', account: accountA.id, session: accountA.sid }]);
    await expect(page.getByText('Поздний ответ AI Совета из аккаунта A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Поздний ответ AI Совета из аккаунта A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('ai-council-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held personal-plan retry cannot update either profile after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'personal_plan');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  await page.evaluate(({ key, accountId }) => {
    localStorage.setItem(key, JSON.stringify({ feature: 'personal_plan', type: 'plan', userId: accountId, actionId: 'seeded-plan' }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });
  const retry = page.getByRole('button', { name: 'Retry: Plan', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  await retry.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const settledBeforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(settledBeforeSwitch, profileKey(accountA.id));
  const valuesABefore = valuesFor(settledBeforeSwitch, accountA);
  const operationsABefore = operationsFor(settledBeforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;

  try {
    const switched = await openAccountB(context, state);
    const accountBBefore = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(accountBBefore, profileKey(accountB.id));
    const valuesBBefore = valuesFor(accountBBefore, accountB);
    const operationsBBefore = operationsFor(accountBBefore, accountB);
    const profileWritesBeforeResponse = [...fixtureA.counts.profileWrites];
    const stateWritesBeforeResponse = [...fixtureA.counts.stateWrites];
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBeforeResponse);
    expect(fixtureA.counts.stateWrites).toEqual(stateWritesBeforeResponse);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    await expect(page.getByText('Поздний план A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('personal-plan-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held plateau retry cannot appear after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id, true) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(message.text());
  });
  const fixtureA = await installAccountApi(page, state, 'plateau');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  await page.evaluate(({ key, accountId }) => {
    localStorage.setItem(key, JSON.stringify({
      feature: 'plateau', type: 'plateau', userId: accountId, actionId: 'seeded-plateau-retry',
    }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });
  const retry = page.getByRole('button', { name: 'Retry: Plateau', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  await retry.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect(page.getByRole('button', { name: 'AI думает...', exact: true })).toBeVisible();

  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  const profileABefore = rawValue(beforeSwitch, profileKey(accountA.id));
  const valuesABefore = valuesFor(beforeSwitch, accountA);
  const operationsABefore = operationsFor(beforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;

  try {
    const switched = await openAccountB(context, state);
    const accountBBefore = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(accountBBefore, profileKey(accountB.id));
    const valuesBBefore = valuesFor(accountBBefore, accountB);
    const operationsBBefore = operationsFor(accountBBefore, accountB);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);
    const profileWritesBeforeResponse = [...fixtureA.counts.profileWrites];
    const stateWritesBeforeResponse = [...fixtureA.counts.stateWrites];
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBeforeResponse);
    expect(fixtureA.counts.stateWrites).toEqual(stateWritesBeforeResponse);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    await expect(page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Нажмите «Объяснить», чтобы AI интерпретировал вашу динамику веса и комплаенс режима.')).toBeVisible();
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('plateau-retry-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});
test('held plateau explanation cannot appear after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The plan screen acceptance uses desktop navigation.');
  const profileA = profileFor(accountA.id, true);
  const state: FixtureState = { current: accountA, profile: profileA };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(message.text());
  });
  const fixtureA = await installAccountApi(page, state, 'plateau');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  const explanation = page.getByRole('button', { name: 'Объяснить', exact: true });
  await expect(explanation).toBeVisible();
  await explanation.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect(page.getByRole('button', { name: 'AI думает...', exact: true })).toBeVisible();
  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const settledBeforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(settledBeforeSwitch, profileKey(accountA.id));
  const coachABefore = rawValue(settledBeforeSwitch, coachKey(accountA.id));
  const valuesABefore = valuesFor(settledBeforeSwitch, accountA);
  const operationsABefore = operationsFor(settledBeforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;

  try {
    const switched = await openAccountB(context, state);
    const accountBBefore = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(accountBBefore, profileKey(accountB.id));
    const coachBBefore = rawValue(accountBBefore, coachKey(accountB.id));
    const valuesBBefore = valuesFor(accountBBefore, accountB);
    const operationsBBefore = operationsFor(accountBBefore, accountB);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(rawValue(final, coachKey(accountA.id))).toBe(coachABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(rawValue(final, coachKey(accountB.id))).toBe(coachBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    await expect(page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Нажмите «Объяснить», чтобы AI интерпретировал вашу динамику веса и комплаенс режима.')).toBeVisible();
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('plateau-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held personal weekly-menu response cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The plan screen acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'weekly_menu');
  await openApp(page, '/#plan');
  await expect(page).toHaveTitle(/FitFocus/);
  const generate = page.getByRole('button', { name: 'Обновить план', exact: true });
  await expect(generate).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await generate.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);

  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const settledBeforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(settledBeforeSwitch, profileKey(accountA.id));
  const valuesABefore = valuesFor(settledBeforeSwitch, accountA);
  const operationsABefore = operationsFor(settledBeforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const stateWritesBefore = [...fixtureA.counts.stateWrites];

  try {
    const switched = await openAccountB(context, state);
    const accountBBefore = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(accountBBefore, profileKey(accountB.id));
    const valuesBBefore = valuesFor(accountBBefore, accountB);
    const operationsBBefore = operationsFor(accountBBefore, accountB);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    // The weekly report engine may independently persist its own key while this held menu request is in flight.
    expect(fixtureA.counts.stateWrites.filter(key => key !== weeklyReportsKey(accountA.id)))
      .toEqual(stateWritesBefore.filter(key => key !== weeklyReportsKey(accountA.id)));
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    await expect(page.getByText('Позднее меню A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Позднее меню A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await switched.page.screenshot({ path: info.outputPath('weekly-menu-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held weekly report cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The weekly AI report account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'wis_text');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);

  const reportKeyA = weeklyReportsKey(accountA.id);
  const reportKeyB = weeklyReportsKey(accountB.id);
  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  const reportABefore = rawValue(beforeSwitch, reportKeyA);
  const reportOperationsABefore = beforeSwitch.operations.filter(operation => operation.accountId === accountA.id && operation.key === reportKeyA);
  const reportWritesABefore = fixtureA.counts.stateWrites.filter(key => key === reportKeyA);

  try {
    const switched = await openAccountB(context, state);
    await expect.poll(() => switched.fixture.counts.completedAiFeatures).toContain('wis_text');
    await expect.poll(async () => (await readDurableSnapshot(switched.page)).operations
      .filter(operation => operation.accountId === accountB.id && operation.key === reportKeyB)).toEqual([]);
    const beforeB = await readDurableSnapshot(switched.page);
    expect(beforeB.activeSession?.accountId).toBe(accountB.id);
    const reportBBefore = rawValue(beforeB, reportKeyB);
    const reportOperationsBBefore = beforeB.operations.filter(operation => operation.accountId === accountB.id && operation.key === reportKeyB);
    expect(reportBBefore).not.toBeNull();
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(switched.page);
    expect(rawValue(final, reportKeyA)).toBe(reportABefore);
    expect(final.operations.filter(operation => operation.accountId === accountA.id && operation.key === reportKeyA))
      .toEqual(reportOperationsABefore);
    expect(fixtureA.counts.stateWrites.filter(key => key === reportKeyA)).toEqual(reportWritesABefore);
    expect(rawValue(final, reportKeyB)).toBe(reportBBefore);
    expect(final.operations.filter(operation => operation.accountId === accountB.id && operation.key === reportKeyB))
      .toEqual(reportOperationsBBefore);
    await expect(page.getByText('Поздний отчёт недели из аккаунта A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Поздний отчёт недели из аккаунта A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
  }
});

test('held food photo analysis cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Photo diary account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'foodphoto');
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);
  const upload = page.locator('input[type="file"][multiple]').first();
  await expect(upload).toHaveCount(1);
  await upload.setInputFiles({
    name: 'meal.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);

  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const settledBeforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(settledBeforeSwitch, profileKey(accountA.id));
  const valuesABefore = valuesFor(settledBeforeSwitch, accountA);
  const operationsABefore = operationsFor(settledBeforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const stateWritesBefore = [...fixtureA.counts.stateWrites];

  try {
    const switched = await openAccountB(context, state);
    const snapshotB = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(snapshotB, profileKey(accountB.id));
    const valuesBBefore = valuesFor(snapshotB, accountB);
    const operationsBBefore = operationsFor(snapshotB, accountB);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    const diaryKeys = [diaryKey(accountA.id), historyKey(accountA.id)];
    expect(fixtureA.counts.stateWrites.filter(key => diaryKeys.includes(key)))
      .toEqual(stateWritesBefore.filter(key => diaryKeys.includes(key)));
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    await expect(page.getByText('Поздняя еда A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Поздняя еда A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await switched.page.screenshot({ path: info.outputPath('food-photo-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held recipe photo analysis cannot create a stale draft after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Recipe photo account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'foodphoto_enhanced');
  await openApp(page, '/#recipes');
  await expect(page).toHaveTitle(/FitFocus/);
  const fileInput = page.locator('input[type="file"]').nth(1);
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles({
    name: 'recipe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>'),
  });
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);

  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const profileABefore = rawValue(beforeSwitch, profileKey(accountA.id));
  const valuesABefore = valuesFor(beforeSwitch, accountA);
  const operationsABefore = operationsFor(beforeSwitch, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const stateWritesBefore = [...fixtureA.counts.stateWrites];

  try {
    const switched = await openAccountB(context, state);
    const snapshotB = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(snapshotB, profileKey(accountB.id));
    const valuesBBefore = valuesFor(snapshotB, accountB);
    const operationsBBefore = operationsFor(snapshotB, accountB);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(valuesFor(final, accountA)).toEqual(valuesABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(valuesFor(final, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    const diaryKeys = [diaryKey(accountA.id), historyKey(accountA.id)];
    expect(fixtureA.counts.stateWrites.filter(key => diaryKeys.includes(key)))
      .toEqual(stateWritesBefore.filter(key => diaryKeys.includes(key)));
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    await expect(page.getByText('Поздний рецепт A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Поздний рецепт A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await switched.page.screenshot({ path: info.outputPath('recipe-photo-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('an unsaved recipe draft from account A is cleared when another tab activates account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Workspace draft account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  page.on('dialog', async dialog => { errorsA.push(`dialog: ${dialog.message()}`); await dialog.dismiss(); });
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#recipes');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const photoInput = page.locator('input[type="file"]').nth(1);
  await expect(photoInput).toHaveCount(1);
  await photoInput.setInputFiles({
    name: 'recipe-draft.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>'),
  });
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('foodphoto_enhanced');
  try {
    await expect(page.getByText('Новое блюдо', { exact: true })).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    throw new Error(`Recipe draft diagnostics: ${JSON.stringify({
      completedAiFeatures: fixtureA.counts.completedAiFeatures,
      aiRequests: fixtureA.counts.aiRequests,
      errorsA,
    })}`, { cause: error });
  }
  const draftTitle = page.locator('div.fixed.inset-0 input').first();
  await expect(draftTitle).toHaveValue('Тестовый рецепт');
  await draftTitle.fill('Черновик профиля A');
  const beforeSwitch = await readDurableSnapshot(page);
  const operationsBefore = operationsFor(beforeSwitch, accountA);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByText('Новое блюдо', { exact: true })).toHaveCount(0);
  await expect(draftTitle).toHaveCount(0);

  const afterSwitch = await readDurableSnapshot(page);
  expect(afterSwitch.activeSession?.accountId).toBe(accountB.id);
  expect(operationsFor(afterSwitch, accountA)).toEqual(operationsBefore);
  expect(await switched.page.getByText('Черновик профиля A', { exact: true }).count()).toBe(0);
  expect(errorsA).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('recipe-draft-cleared-on-account-switch.png') });
  expect(fixtureA.counts.profileWrites).toEqual([]);
});

test('an unsaved progress measurement draft is cleared when another tab activates account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Workspace draft account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#progress');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Новый замер', exact: true })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect.poll(async () => rawValue(await readDurableSnapshot(page), profileKey(accountA.id))).not.toBeNull();
  await waitForAccountOutboxIdle(page, accountA);

  const progressUiKeyA = `fitfocus.progress.ui.v1:${accountA.id}`;
  const progressUiStateA = {
    selectedMetric: 'bloodGlucoseMmolL',
    activeSection: 'dynamics',
    mobileDetailsOpen: false,
    timelineFilter: 'all',
    compareFromKey: '',
    compareToKey: '',
    compareMode: 'matched',
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: progressUiKeyA,
    value: progressUiStateA,
  });
  await page.reload();
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByRole('button', { name: 'Сахар', exact: true })).toHaveClass(/border-indigo-500/);

  const weightDraft = page.getByLabel('Вес');
  await weightDraft.fill('98.765');
  await expect(weightDraft).toHaveValue('98.765');
  const progressUiCacheBeforeSwitch = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), progressUiKeyA);
  expect(progressUiCacheBeforeSwitch.selectedMetric).toBe('bloodGlucoseMmolL');
  const beforeSwitch = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeSwitch, profileKey(accountA.id));
  const operationsBefore = operationsFor(beforeSwitch, accountA);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByRole('heading', { name: 'Новый замер', exact: true })).toBeVisible();
  await expect(weightDraft).not.toHaveValue('98.765');
  await expect(page.getByRole('button', { name: 'Вес', exact: true })).toHaveClass(/border-indigo-500/);
  await expect(page.getByRole('button', { name: 'Сахар', exact: true })).not.toHaveClass(/border-indigo-500/);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), progressUiKeyA))
    .toEqual(progressUiCacheBeforeSwitch);

  const afterSwitch = await readDurableSnapshot(page);
  expect(afterSwitch.activeSession?.accountId).toBe(accountB.id);
  expect(rawValue(afterSwitch, profileKey(accountA.id))).toBe(profileBefore);
  expect(operationsFor(afterSwitch, accountA)).toEqual(operationsBefore);
  expect(await switched.page.getByText('98.765', { exact: true }).count()).toBe(0);
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(errorsA).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('progress-draft-cleared-on-account-switch.png') });
});

test('a profile draft cached for account A is not restored after another tab activates account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Workspace draft account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const nameDraft = page.getByPlaceholder('Как к вам обращаться');
  await expect(nameDraft).toHaveValue('Профиль A');
  await nameDraft.fill('Черновик настроек аккаунта A');
  const settingsKeyA = `fitfocus.settings.ui.v1:${accountA.id}`;
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), settingsKeyA))
    .toContain('"profileDirty":true');

  await page.reload();
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Черновик настроек аккаунта A');

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect.poll(() => page.getByPlaceholder('Как к вам обращаться').inputValue())
    .not.toBe('Черновик настроек аккаунта A');

  const cachedDraft = await page.evaluate(key => localStorage.getItem(key), settingsKeyA);
  expect(cachedDraft).toContain('"profileDirty":true');
  expect(cachedDraft).toContain('Черновик настроек аккаунта A');
  await switched.page.goto('/#settings');
  await expect(switched.page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Профиль B');
  expect(fixtureA.counts.profileWrites).toEqual([]);
});

test('a dashboard weight draft cached for account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Workspace draft account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const weightDraft = page.getByLabel('Вес сегодня');
  await weightDraft.fill('98.765');
  const weightDraftKeyA = `fitfocus.dashboard.new-weight.v1:${accountA.id}`;
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), weightDraftKeyA)).toBe('98.765');

  await page.reload();
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByLabel('Вес сегодня')).toHaveValue('98.765');

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByLabel('Вес сегодня')).not.toHaveValue('98.765');
  expect(await page.evaluate(key => localStorage.getItem(key), weightDraftKeyA)).toBe('98.765');
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(switched.errors).toEqual([]);
});

test('food photo analysis persists the diary entry, history and usage for its active account', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The full photo analysis success path is covered in desktop Chromium.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixture = await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  const upload = page.locator('input[type="file"][multiple]').first();
  await expect(upload).toHaveCount(1);
  await upload.setInputFiles({
    name: 'meal.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });

  await expect(page.getByText('Тестовый омлет', { exact: true }).first()).toBeVisible();
  await expect.poll(() => fixture.counts.completedAiFeatures).toContain('foodphoto');
  await waitForAccountOutboxIdle(page, accountA);
  const snapshot = await readDurableSnapshot(page);
  const profile = JSON.parse(rawValue(snapshot, profileKey(accountA.id)) ?? 'null') as ReturnType<typeof profileFor> | null;
  const diary = JSON.parse(rawValue(snapshot, diaryKey(accountA.id)) ?? '[]') as Array<{ name: string; calories: number }>;
  const history = JSON.parse(rawValue(snapshot, historyKey(accountA.id)) ?? '[]') as Array<{ name: string; calories: number }>;

  expect(snapshot.activeSession?.accountId).toBe(accountA.id);
  expect(profile?.usage.aiFoodPhotoCount).toBe(1);
  expect(diary).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Тестовый омлет', calories: 320 })]));
  expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Тестовый омлет', calories: 320 })]));
  expect(operationsFor(snapshot, accountA)).toEqual([]);
  expect(fixture.counts.profileWrites).toEqual([accountA.id]);
  expect(fixture.counts.achievementChecks).toBeGreaterThan(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('food-photo-analysis-success.png') });
});

test('a held step-by-step recipe response cannot update the diary or usage after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Recipe generation account-switch acceptance runs in desktop browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'recipe');
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  await page.locator('input[type="file"][multiple]').first().setInputFiles({
    name: 'meal.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });
  await expect(page.getByText('Тестовый омлет', { exact: true }).first()).toBeVisible();
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('foodphoto');
  await waitForAccountOutboxIdle(page, accountA);

  await page.getByRole('button', { name: /Итого калорий/ }).click();
  await page.getByRole('button', { name: 'Получить пошаговый рецепт', exact: true }).click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  await waitForAccountOutboxIdle(page, accountA);
  const settledBeforeSwitch = await readDurableSnapshot(page);
  const diaryABefore = rawValue(settledBeforeSwitch, diaryKey(accountA.id));
  const profileABefore = rawValue(settledBeforeSwitch, profileKey(accountA.id));
  const operationsABefore = operationsFor(settledBeforeSwitch, accountA);
  const usageBefore = await page.evaluate((keys) => keys.map(key => localStorage.getItem(key)), [recipeUsageKey(accountA.id), recipeUsageKey(accountB.id)]);

  try {
    const switched = await openAccountB(context, state);
    const snapshotB = await readDurableSnapshot(switched.page);
    const diaryBBefore = rawValue(snapshotB, diaryKey(accountB.id));
    const profileBBefore = rawValue(snapshotB, profileKey(accountB.id));
    const operationsBBefore = operationsFor(snapshotB, accountB);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const final = await readDurableSnapshot(page);
    expect(rawValue(final, diaryKey(accountA.id))).toBe(diaryABefore);
    expect(rawValue(final, profileKey(accountA.id))).toBe(profileABefore);
    expect(operationsFor(final, accountA)).toEqual(operationsABefore);
    expect(rawValue(final, diaryKey(accountB.id))).toBe(diaryBBefore);
    expect(rawValue(final, profileKey(accountB.id))).toBe(profileBBefore);
    expect(operationsFor(final, accountB)).toEqual(operationsBBefore);
    expect(await page.evaluate((keys) => keys.map(key => localStorage.getItem(key)), [recipeUsageKey(accountA.id), recipeUsageKey(accountB.id)]))
      .toEqual(usageBefore);
    await expect(page.getByText('Поздний пошаговый рецепт A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Поздний пошаговый рецепт A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await switched.page.screenshot({ path: info.outputPath('step-by-step-recipe-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('step-by-step recipe generation uses the active session and commits the diary update', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'The full step-by-step recipe success path is covered in desktop Chromium.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixture = await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  await page.locator('input[type="file"][multiple]').first().setInputFiles({
    name: 'meal.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });
  await expect(page.getByText('Тестовый омлет', { exact: true }).first()).toBeVisible();
  await expect.poll(() => fixture.counts.completedAiFeatures).toContain('foodphoto');
  await waitForAccountOutboxIdle(page, accountA);

  await page.getByRole('button', { name: /Итого калорий/ }).click();
  await page.getByRole('button', { name: 'Получить пошаговый рецепт', exact: true }).click();
  await expect(page.getByText('Пошаговый тестовый рецепт', { exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);

  const snapshot = await readDurableSnapshot(page);
  const diary = JSON.parse(rawValue(snapshot, diaryKey(accountA.id)) ?? '[]') as Array<{ name: string; insight?: { recipe?: { title?: string } } }>;
  expect(fixture.counts.aiRequests.filter(item => item.feature === 'recipe')).toEqual([
    { feature: 'recipe', account: accountA.id, session: accountA.sid },
  ]);
  expect(diary).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Тестовый омлет', insight: expect.objectContaining({ recipe: expect.objectContaining({ title: 'Пошаговый тестовый рецепт' }) }) }),
  ]));
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').recipes, recipeUsageKey(accountA.id))).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), recipeUsageKey(accountB.id))).toBeNull();
  expect(operationsFor(snapshot, accountA)).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('step-by-step-recipe-success.png') });
});

test('a held achievement unlock from account A is ignored after another tab signs in as account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(page, state);
  const held = deferred();
  const counts = { heldChecks: 0, releasedChecks: 0 };

  await page.route('**/api/achievements', async route => route.fulfill({
    contentType: 'application/json',
    headers: scopedHeaders(accountA),
    body: JSON.stringify({ enabled: true, catalog: [], unlocked: [] }),
  }));
  await page.route('**/api/achievements/check', async route => {
    const request = route.request();
    const body = request.postDataJSON() as { context?: { source?: string } };
    if (request.headers()['x-fitfocus-state-account'] === accountA.id && body.context?.source === 'app_open') {
      expect(request.headers()['x-fitfocus-state-session']).toBe(accountA.sid);
      counts.heldChecks += 1;
      await held.promise;
      await route.fulfill({
        contentType: 'application/json',
        headers: scopedHeaders(accountA),
        body: JSON.stringify({ enabled: true, newlyUnlocked: [{
          key: 'obsolete-account-a', title: 'Позднее достижение A', description: 'Устаревший ответ',
          tier: 'bronze', category: 'profile', unlocked_at: 123,
        }] }),
      });
      counts.releasedChecks += 1;
      return;
    }
    await route.fallback();
  });

  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => counts.heldChecks).toBe(1);
  expect((await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  try {
    const switched = await openAccountB(context, state);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);
    held.release();
    await expect.poll(() => counts.releasedChecks).toBe(1);
    const final = await readDurableSnapshot(page);
    expect(final.activeSession?.accountId).toBe(accountB.id);
    await expect(page.getByText('Позднее достижение A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Позднее достижение A', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Новое достижение', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Новое достижение', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await switched.page.screenshot({ path: info.outputPath('achievement-late-response-account-switch.png') });
  } finally {
    held.release();
  }
});
test('pending account A outbox stays scoped while B signs in and resumes with a fresh A session', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The state outbox account-switch acceptance uses desktop tabs.');
  const planKeyA = 'fitfocus_data_' + accountA.id + '_plan_task_done';
  const stateWrites: StateWriteAttempt[] = [];
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    stateWriteLog: stateWrites,
    holdStateWriteFailures: { key: planKeyA, active: true, retryAfterSeconds: 10 },
  };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/503/.test(message.text())) errorsA.push(message.text());
  });
  await installAccountApi(page, state);
  await openApp(page, '/#plan');
  const task = page.getByRole('button', { name: 'Записать первый завтрак', exact: true });
  await expect(task).toBeVisible();
  await task.click();

  await expect.poll(() => stateWrites.filter(write => write.keys.includes(planKeyA))).toHaveLength(1);
  await expect.poll(async () => (await readDurableSnapshot(page)).operations
    .find(operation => operation.key === planKeyA)?.status).toBe('pending');
  const beforeSwitch = await readDurableSnapshot(page);
  const pendingA = beforeSwitch.operations.find(operation => operation.key === planKeyA)!;
  expect(pendingA).toMatchObject({
    accountId: accountA.id, status: 'pending', retryCount: 1, reason: 'http-503',
  });
  expect(stateWrites.find(write => write.keys.includes(planKeyA)))
    .toMatchObject({ account: accountA.id, session: accountA.sid, keys: [planKeyA] });
  const switched = await openAccountB(context, state);
  await expect.poll(async () => (await readDurableSnapshot(switched.page)).activeSession?.serverSessionId).toBe(accountB.sid);
  await expect.poll(async () => (await readDurableSnapshot(switched.page)).operations
    .find(operation => operation.key === planKeyA)?.status).toMatch(/^(pending|sending)$/);
  const pendingDuringB = (await readDurableSnapshot(switched.page)).operations.find(operation => operation.key === planKeyA);
  expect(pendingDuringB).toMatchObject({ opId: pendingA.opId, accountId: accountA.id, value: pendingA.value });
  expect(pendingDuringB?.status).toMatch(/^(pending|sending)$/);
  const aAttemptsWhileBActive = stateWrites.filter(write => write.keys.includes(planKeyA)).length;
  await switched.page.waitForTimeout(Math.max(0, pendingDuringB!.nextAttemptAtMs - Date.now()) + 1_100);
  expect(stateWrites.filter(write => write.keys.includes(planKeyA))).toHaveLength(aAttemptsWhileBActive);

  await openApp(switched.page, '/#settings');
  const light = switched.page.getByRole('button', { name: /^Светлая/ });
  await expect(light).toBeVisible();
  await light.click();
  const settingsKeyB = 'fitfocus_data_' + accountB.id + '_settings';
  await expect.poll(() => stateWrites.some(write => write.account === accountB.id && write.keys.includes(settingsKeyB))).toBe(true);

  const freshAccountA = { id: accountA.id, sid: 'c'.repeat(64) };
  state.holdStateWriteFailures!.active = false;
  state.current = freshAccountA;
  state.profile = profileFor(accountA.id);
  const returningPage = await context.newPage();
  const errorsReturning: string[] = [];
  returningPage.on('pageerror', error => errorsReturning.push(error.message));
  returningPage.on('console', message => {
    if (message.type() === 'error' && !/503/.test(message.text())) errorsReturning.push(message.text());
  });
  await installAccountApi(returningPage, state);
  await openApp(returningPage, '/#plan');
  await expect.poll(async () => (await readDurableSnapshot(returningPage)).operations
    .filter(operation => operation.key === planKeyA)).toEqual([]);
  const resumedWrites = stateWrites.filter(write => write.keys.includes(planKeyA));
  expect(resumedWrites.length).toBeGreaterThanOrEqual(2);
  expect(resumedWrites.slice(0, -1).every(write => write.account === accountA.id && write.session === accountA.sid)).toBe(true);
  expect(resumedWrites.at(-1)).toMatchObject({ account: accountA.id, session: freshAccountA.sid, keys: [planKeyA] });
  expect(stateWrites.filter(write => write.account === accountB.id && write.keys.includes(planKeyA))).toEqual([]);
  await expect(returningPage.getByText('1/3 выполнено', { exact: true })).toBeVisible();
  expect(errorsA).toEqual([]);
  expect(errorsReturning).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(returningPage.locator('vite-error-overlay')).toHaveCount(0);
  await returningPage.screenshot({ path: info.outputPath('state-outbox-account-a-resumed.png') });
});

test('pending account A outbox resumes after reload with the same operation and a fresh session', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The state outbox reload acceptance runs in desktop browser profiles.');
  const planKeyA = 'fitfocus_data_' + accountA.id + '_plan_task_done';
  const stateWrites: StateWriteAttempt[] = [];
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    stateWriteLog: stateWrites,
    holdStateWriteFailures: { key: planKeyA, active: true },
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/503/.test(message.text())) errors.push(message.text());
  });
  await installAccountApi(page, state);
  await openApp(page, '/#plan');
  const task = page.getByRole('button', { name: 'Записать первый завтрак', exact: true });
  await expect(task).toBeVisible();
  await task.click();

  await expect.poll(() => stateWrites.filter(write => write.keys.includes(planKeyA))).toHaveLength(1);
  await expect.poll(async () => (await readDurableSnapshot(page)).operations
    .find(operation => operation.key === planKeyA)?.status).toBe('pending');
  const beforeReload = await readDurableSnapshot(page);
  const pendingA = beforeReload.operations.find(operation => operation.key === planKeyA)!;
  expect(pendingA).toMatchObject({
    accountId: accountA.id, status: 'pending', retryCount: 1, reason: 'http-503',
  });
  expect(stateWrites.find(write => write.keys.includes(planKeyA)))
    .toMatchObject({ account: accountA.id, session: accountA.sid, keys: [planKeyA] });

  const freshAccountA = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = freshAccountA;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Записать первый завтрак', exact: true })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId).toBe(freshAccountA.sid);
  await expect.poll(() => stateWrites.some(write => write.keys.includes(planKeyA) && write.session === freshAccountA.sid)).toBe(true);

  const resumed = (await readDurableSnapshot(page)).operations.find(operation => operation.key === planKeyA);
  expect(resumed).toMatchObject({ opId: pendingA.opId, accountId: accountA.id, status: 'pending', value: pendingA.value });
  state.holdStateWriteFailures!.active = false;
  await expect.poll(async () => (await readDurableSnapshot(page)).operations
    .filter(operation => operation.key === planKeyA)).toEqual([]);

  const resumedWrites = stateWrites.filter(write => write.keys.includes(planKeyA));
  expect(resumedWrites.some(write => write.account === accountA.id && write.session === freshAccountA.sid)).toBe(true);
  await expect(page.getByText('1/3 выполнено', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('state-outbox-account-a-reloaded.png') });
});

test('pending account A outbox pauses on logout and resumes after login with a fresh session', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The state outbox logout/login acceptance runs in desktop browser profiles.');
  const planKeyA = 'fitfocus_data_' + accountA.id + '_plan_task_done';
  const stateWrites: StateWriteAttempt[] = [];
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    stateWriteLog: stateWrites,
    holdStateWriteFailures: { key: planKeyA, active: true },
  };
  let authenticated = true;
  let logoutRequests = 0;
  let loginRequests = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/503/.test(message.text())) errors.push(message.text());
  });
  await installAccountApi(page, state);
  await page.route('**/api/me*', async route => {
    if (authenticated) return route.fallback();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: null, hasAccess: true }) });
  });
  await page.route('**/api/logout', async route => {
    logoutRequests += 1;
    authenticated = false;
    await route.fallback();
  });
  const freshAccountA = { id: accountA.id, sid: 'e'.repeat(64) };
  await page.route('**/api/auth/google/start*', async route => {
    loginRequests += 1;
    state.current = freshAccountA;
    state.profile = profileFor(accountA.id);
    authenticated = true;
    await route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><body><script>location.replace("/#plan")</script></body></html>' });
  });

  await openApp(page, '/#plan');
  const task = page.getByRole('button', { name: 'Записать первый завтрак', exact: true });
  await expect(task).toBeVisible();
  await task.click();
  await expect.poll(() => stateWrites.filter(write => write.keys.includes(planKeyA))).toHaveLength(1);
  await expect.poll(async () => (await readDurableSnapshot(page)).operations
    .find(operation => operation.key === planKeyA)?.status).toBe('pending');
  const beforeLogout = await readDurableSnapshot(page);
  const pendingA = beforeLogout.operations.find(operation => operation.key === planKeyA)!;
  expect(pendingA).toMatchObject({ accountId: accountA.id, status: 'pending', retryCount: 1, reason: 'http-503' });

  await openApp(page, '/#settings');
  await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
  const googleLogin = page.getByRole('link', { name: /Google профиль/ });
  await expect(googleLogin).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession).toBeNull();
  expect(logoutRequests).toBe(1);
  const writesWhileLoggedOut = stateWrites.filter(write => write.keys.includes(planKeyA)).length;
  await page.waitForTimeout(Math.max(0, pendingA.nextAttemptAtMs - Date.now()) + 1_100);
  expect(stateWrites.filter(write => write.keys.includes(planKeyA))).toHaveLength(writesWhileLoggedOut);
  const loggedOut = await readDurableSnapshot(page);
  expect(loggedOut.operations.find(operation => operation.key === planKeyA))
    .toMatchObject({ opId: pendingA.opId, accountId: accountA.id, status: 'pending', value: pendingA.value });

  await googleLogin.click();
  await expect(page).toHaveURL(/#plan$/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId).toBe(freshAccountA.sid);
  await expect.poll(() => stateWrites.some(write => write.keys.includes(planKeyA) && write.session === freshAccountA.sid)).toBe(true);
  const resumed = (await readDurableSnapshot(page)).operations.find(operation => operation.key === planKeyA);
  expect(resumed).toMatchObject({ opId: pendingA.opId, accountId: accountA.id, status: 'pending', value: pendingA.value });
  expect(loginRequests).toBe(1);
  state.holdStateWriteFailures!.active = false;
  await expect.poll(async () => (await readDurableSnapshot(page)).operations
    .filter(operation => operation.key === planKeyA)).toEqual([]);

  const resumedWrites = stateWrites.filter(write => write.keys.includes(planKeyA));
  expect(resumedWrites.at(-1)).toMatchObject({ account: accountA.id, session: freshAccountA.sid, keys: [planKeyA] });
  await expect(page.getByText('1/3 выполнено', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('state-outbox-account-a-after-login.png') });
});

test('late Huawei sync after another tab signs in as account B cannot commit account A profile', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The Settings Huawei acceptance runs in desktop browser profiles.');
  const profileA = { ...profileFor(accountA.id), wearableProvider: 'huawei_health', wearableEnabled: true };
  const state: FixtureState = { current: accountA, profile: profileA };
  const fixtureA = await installAccountApi(page, state, undefined, true);
  await openApp(page, '/#settings');
  await expect(page.getByRole('button', { name: 'Обновить Huawei', exact: true })).toBeEnabled();
  await waitForAccountOutboxIdle(page, accountA);
  const beforeA = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeA, profileKey(accountA.id));
  const profileOperationsBefore = beforeA.operations.filter(operation => operation.key === profileKey(accountA.id));

  await page.getByRole('button', { name: 'Обновить Huawei', exact: true }).click();
  await expect.poll(() => fixtureA.counts.huaweiSyncRequests).toHaveLength(1);
  const switched = await openAccountB(context, state);
  const beforeB = await readDurableSnapshot(switched.page);
  const profileBBefore = rawValue(beforeB, profileKey(accountB.id));

  fixtureA.releaseHuawei();
  await expect.poll(() => fixtureA.counts.huaweiSyncResponses).toBe(1);
  await expect(page.getByRole('button', { name: 'Обновить Huawei', exact: true })).toHaveText('Обновить Huawei');
  await expect(page.getByText('Huawei Health синхронизирован: обновлено полей 1.', { exact: true })).toHaveCount(0);

  const afterA = await readDurableSnapshot(page);
  expect(fixtureA.counts.huaweiSyncRequests).toEqual([{ account: accountA.id, session: accountA.sid }]);
  expect(rawValue(afterA, profileKey(accountA.id))).toBe(profileBefore);
  expect(afterA.operations.filter(operation => operation.key === profileKey(accountA.id))).toEqual(profileOperationsBefore);
  const afterB = await readDurableSnapshot(switched.page);
  expect(rawValue(afterB, profileKey(accountB.id))).toBe(profileBBefore);
});

test('late Huawei sync is rejected after the same account signs in with a new server session', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The Settings Huawei session-replacement acceptance runs in desktop browser profiles.');
  const profileA = { ...profileFor(accountA.id), wearableProvider: 'huawei_health', wearableEnabled: true };
  const state: FixtureState = { current: accountA, profile: profileA };
  const fixtureA = await installAccountApi(page, state, undefined, true);
  await openApp(page, '/#settings');
  await expect(page.getByRole('button', { name: 'Обновить Huawei', exact: true })).toBeEnabled();
  await waitForAccountOutboxIdle(page, accountA);

  const before = await readDurableSnapshot(page);
  const profileBefore = rawValue(before, profileKey(accountA.id));
  const operationsBefore = before.operations.filter(operation => operation.key === profileKey(accountA.id));
  await page.getByRole('button', { name: 'Обновить Huawei', exact: true }).click();
  await expect.poll(() => fixtureA.counts.huaweiSyncRequests).toHaveLength(1);
  expect(fixtureA.counts.huaweiSyncRequests).toEqual([{ account: accountA.id, session: accountA.sid }]);

  const reauthenticated = { id: accountA.id, sid: 'c'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  await installAccountApi(reauthenticatedPage, state);
  await openApp(reauthenticatedPage, '/#settings');
  await expect(reauthenticatedPage.getByRole('button', { name: 'Обновить Huawei', exact: true })).toBeEnabled();
  await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
    .toBe(reauthenticated.sid);

  try {
    fixtureA.releaseHuawei();
    await expect.poll(() => fixtureA.counts.huaweiSyncResponses).toBe(1);
    await expect(page.getByText('Huawei Health синхронизирован: обновлено полей 1.', { exact: true })).toHaveCount(0);

    const afterOriginalPage = await readDurableSnapshot(page);
    expect(afterOriginalPage.activeSession?.serverSessionId).toBe(reauthenticated.sid);
    expect(rawValue(afterOriginalPage, profileKey(accountA.id))).toBe(profileBefore);
    expect(afterOriginalPage.operations.filter(operation => operation.key === profileKey(accountA.id))).toEqual(operationsBefore);

    const afterReauthenticatedPage = await readDurableSnapshot(reauthenticatedPage);
    expect(afterReauthenticatedPage.activeSession?.serverSessionId).toBe(reauthenticated.sid);
    expect(rawValue(afterReauthenticatedPage, profileKey(accountA.id))).toBe(profileBefore);
    expect(afterReauthenticatedPage.operations.filter(operation => operation.key === profileKey(accountA.id))).toEqual(operationsBefore);
  } finally {
    fixtureA.releaseHuawei();
  }
});
