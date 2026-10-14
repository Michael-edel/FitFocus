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

type Account = typeof accountA;
type Feature = 'coach_advice' | 'plateau' | 'personal_plan' | 'weekly_menu' | 'foodphoto' | 'foodphoto_enhanced';
type FixtureState = { current: Account; profile: ReturnType<typeof profileFor> };

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
    profile,
  };
}

async function installAccountApi(page: Page, state: FixtureState, heldFeature?: Feature) {
  const held = deferred();
  const counts = {
    heldRequests: 0,
    heldStartedAtMs: 0,
    releasedResponses: 0,
    achievementChecks: 0,
    completedAiFeatures: [] as string[],
    stateWrites: [] as string[],
    profileWrites: [] as string[],
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
      counts.stateWrites.push(...items.map(item => item.key));
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
    if (path === '/api/ai' && method === 'POST') {
      const feature = request.postDataJSON()?.feature;
      if (feature === heldFeature) {
        expect(requestedAccount).toBe(accountA.id);
        expect(requestedSession).toBe(accountA.sid);
        counts.heldRequests += 1;
        counts.heldStartedAtMs = Date.now();
        await held.promise;
        const text = feature === 'coach_advice'
          ? JSON.stringify({ title: 'Поздний ответ A', advice: 'Совет профиля A', bullets: ['Старые данные'] })
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
          : 'Тестовая интерпретация недели.';
      await json({ text }, responseAccount);
      if (typeof feature === 'string') counts.completedAiFeatures.push(feature);
      return;
    }
    return route.fallback();
  });
  return { counts, release: held.release };
}

type StoredValue = { key: string; value: string };
type StoredOperation = { opId: string; accountId: string; key: string; status: string; resource?: string; value?: string };
type DurableSnapshot = {
  values: StoredValue[];
  operations: StoredOperation[];
  activeSession: { accountId: string; serverSessionId?: string; sessionEpoch: string } | null;
};

async function readDurableSnapshot(page: Page): Promise<DurableSnapshot> {
  return page.evaluate(async () => {
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
        values: values.map((item: { key: string; value: string }) => ({ key: item.key, value: item.value })),
        operations: operations.map((item: StoredOperation) => ({
          opId: item.opId, accountId: item.accountId, key: item.key, status: item.status,
          resource: item.resource, value: item.value,
        })),
        activeSession: session ? {
          accountId: session.accountId, serverSessionId: session.serverSessionId, sessionEpoch: session.sessionEpoch,
        } : null,
      };
    } finally {
      db.close();
    }
  });
}

function rawValue(snapshot: DurableSnapshot, key: string) {
  return snapshot.values.find(value => value.key === key)?.value ?? null;
}

function operationsFor(snapshot: DurableSnapshot, account: Account) {
  return snapshot.operations.filter(operation => operation.accountId === account.id
    && [profileKey(account.id), coachKey(account.id), diaryKey(account.id), historyKey(account.id)].includes(operation.key));
}

function valuesFor(snapshot: DurableSnapshot, account: Account) {
  return snapshot.values.filter(value => [profileKey(account.id), coachKey(account.id), diaryKey(account.id), historyKey(account.id)].includes(value.key));
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

async function openAccountB(context: BrowserContext, state: FixtureState) {
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
  await expect.poll(async () => rawValue(await readDurableSnapshot(page), profileKey(accountB.id))).not.toBeNull();
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
    expect(await page.getByText('Поздний ответ A', { exact: true }).count()).toBe(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('coach-late-response-account-switch.png') });
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
    expect(fixtureA.counts.stateWrites).toEqual(stateWritesBefore);
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
