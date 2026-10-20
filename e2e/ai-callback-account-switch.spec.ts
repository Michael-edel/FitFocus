import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
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
const favoriteRecipesKey = (accountId: string) => `fitfocus_data_${accountId}_favorite_recipes`;
const recipeUsageKey = (accountId: string) => `fitfocus_usage_counters_v1:${encodeURIComponent(accountId)}`;

type Account = typeof accountA;
type Feature = 'coach_advice' | 'plateau' | 'personal_plan' | 'weekly_menu' | 'wis_text' | 'foodphoto' | 'foodphoto_enhanced' | 'recipe' | 'council_chairman';
type StateWriteAttempt = { account?: string; session?: string; keys: string[] };
type FixtureState = {
  current: Account;
  profile: ReturnType<typeof profileFor>;
  stateValues?: Array<{ accountId: string; key: string; value: string; exists: boolean; version: number }>;
  stateWriteLog?: StateWriteAttempt[];
  holdStateWriteFailures?: { key: string; active: boolean; retryAfterSeconds?: number };
  holdProfileRead?: { active: boolean; started: () => void; wait: Promise<void>; profile: ReturnType<typeof profileFor> };
  holdProfileWrite?: { active: boolean; started: () => void; wait: Promise<void> };
  unauthorizedAiFeature?: string;
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
    if (path === '/api/state' && method === 'GET') {
      const prefix = url.searchParams.get('prefix');
      const key = url.searchParams.get('key');
      const items = (state.stateValues ?? []).filter(item => item.accountId === responseAccount.id
        && (prefix ? item.key.startsWith(prefix) : key ? item.key === key : true))
        .map(({ key: itemKey, value, exists, version }) => ({ key: itemKey, value, exists, version }));
      return json({ items }, responseAccount);
    }
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
      if (method === 'GET' && state.holdProfileRead?.active) {
        const hold = state.holdProfileRead;
        hold.active = false;
        hold.started();
        await hold.wait;
        return json({ profile: hold.profile, version: hold.profile.version }, responseAccount);
      }
      if (method === 'PUT') {
        const body = request.postDataJSON() as Record<string, unknown>;
        counts.profileWrites.push(requestedAccount ?? 'missing');
        const writtenProfile = { ...state.profile, ...body, version: Number(body.baseVersion ?? 0) + 1 };
        const hold = state.holdProfileWrite?.active ? state.holdProfileWrite : null;
        if (hold) {
          hold.active = false;
          hold.started();
          await hold.wait;
          return json({ profile: writtenProfile, version: writtenProfile.version }, responseAccount);
        }
        state.profile = writtenProfile;
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
      if (feature === state.unauthorizedAiFeature) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          headers: scopedHeaders(responseAccount),
          body: JSON.stringify({ error: 'UNAUTHENTICATED' }),
        });
      }
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
          : feature === 'plateau'
            ? `Тестовая интерпретация недели для аккаунта ${responseAccount.id === accountA.id ? 'A' : 'B'}.`
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
  attempt?: { attemptId: string; owner: string; sessionEpoch: string; startedAtMs: number };
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
                ...(item.attempt ? { attempt: {
                  attemptId: item.attempt.attemptId, owner: item.attempt.owner,
                  sessionEpoch: item.attempt.sessionEpoch, startedAtMs: item.attempt.startedAtMs,
                } } : {}),
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

async function waitForOutboxKeyIdle(page: Page, account: Account, key: string) {
  await expect.poll(async () => (await readDurableSnapshot(page)).operations
    .filter(operation => operation.accountId === account.id && operation.key === key), { timeout: 15_000 }).toEqual([]);
}

async function installProgressPhotoDecodeGate(page: Page) {
  await page.addInitScript(() => {
    const scopedWindow = window as Window & {
      __fitfocusHoldProgressPhoto?: boolean;
      __fitfocusProgressPhotoDecodeHeld?: boolean;
      __fitfocusProgressPhotoDecodeLoaded?: boolean;
      __fitfocusProgressPhotoDecodeError?: string;
      __fitfocusReleaseProgressPhoto?: () => void;
    };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!descriptor?.set) throw new Error('HTML_IMAGE_SRC_SETTER_NOT_AVAILABLE');
    let pending: { image: HTMLImageElement; url: string } | null = null;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get ? function(this: HTMLImageElement) { return descriptor.get?.call(this); } : undefined,
      set: function(this: HTMLImageElement, value: string) {
        if (scopedWindow.__fitfocusHoldProgressPhoto && value.startsWith('blob:')) {
          pending = { image: this, url: value };
          scopedWindow.__fitfocusProgressPhotoDecodeHeld = true;
          return;
        }
        descriptor.set?.call(this, value);
      },
    });
    scopedWindow.__fitfocusReleaseProgressPhoto = () => {
      const held = pending;
      if (!held) throw new Error('PROGRESS_PHOTO_DECODE_NOT_HELD');
      pending = null;
      scopedWindow.__fitfocusHoldProgressPhoto = false;
      held.image.addEventListener('load', () => { scopedWindow.__fitfocusProgressPhotoDecodeLoaded = true; }, { once: true });
      held.image.addEventListener('error', () => { scopedWindow.__fitfocusProgressPhotoDecodeError = 'IMAGE_DECODE_FAILED'; }, { once: true });
      descriptor.set?.call(held.image, held.url);
    };
  });
}

async function selectHeldProgressPhoto(page: Page, note: string) {
  await page.evaluate(() => {
    (window as Window & { __fitfocusHoldProgressPhoto?: boolean }).__fitfocusHoldProgressPhoto = true;
  });
  await page.getByPlaceholder('Подпись к фото: например, месяц 1').fill(note);
  const photoInput = page.locator('input[type="file"][accept="image/*"][capture]');
  await expect(photoInput).toHaveCount(1);
  await photoInput.setInputFiles({
    name: 'progress.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __fitfocusProgressPhotoDecodeHeld?: boolean }).__fitfocusProgressPhotoDecodeHeld === true,
  )).toBe(true);
}

async function releaseHeldProgressPhoto(page: Page) {
  await page.evaluate(() => {
    (window as Window & { __fitfocusReleaseProgressPhoto?: () => void }).__fitfocusReleaseProgressPhoto?.();
  });
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __fitfocusProgressPhotoDecodeLoaded?: boolean }).__fitfocusProgressPhotoDecodeLoaded === true,
  )).toBe(true);
  expect(await page.evaluate(() => (window as Window & { __fitfocusProgressPhotoDecodeError?: string }).__fitfocusProgressPhotoDecodeError ?? null)).toBeNull();
}

async function waitForAccountSwitch(page: Page) {
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);
  const snapshot = await readDurableSnapshot(page);
  expect(snapshot.activeSession?.serverSessionId).toBe(accountB.sid);
  return snapshot;
}

async function openAccountB(context: BrowserContext, state: FixtureState, waitForProfile = true, path = '/#dashboard') {
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
  await openApp(page, path);
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountSwitch(page);
  if (waitForProfile) {
    await expect.poll(async () => rawValue(await readDurableSnapshot(page), profileKey(accountB.id))).not.toBeNull();
  }
  return { page, errors, fixture };
}

test('navigation aborts a held Coach retry without durable success effects', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const marker = '__e2e_coach_retry_unload__';
  await page.addInitScript(({ markerKey, feature }) => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      let requestFeature: unknown;
      try { requestFeature = typeof init?.body === 'string' ? JSON.parse(init.body).feature : undefined; } catch { /* Ignore unrelated requests. */ }
      if (url.pathname === '/api/ai' && requestFeature === feature && init?.signal) {
        mark('request', 'started');
        init.signal.addEventListener('abort', () => mark('signal', 'aborted'), { once: true });
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
    window.addEventListener('pagehide', () => mark('pagehide', 'fired'));
  }, { markerKey: marker, feature: 'coach_advice' });

  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  const fixture = await installAccountApi(page, state, 'coach_advice');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixture.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  const appOrigin = await page.evaluate(() => location.origin);
  await page.evaluate(markerKey => {
    for (const suffix of ['request', 'signal', 'beforeunload', 'pagehide']) localStorage.removeItem(`${markerKey}:${suffix}`);
  }, marker);
  await page.evaluate(({ key, accountId }) => {
    localStorage.setItem(key, JSON.stringify({ feature: 'coach_advice', type: 'coach', userId: accountId, actionId: 'unload-coach-retry' }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });

  const retry = page.getByRole('button', { name: 'Retry: Coach', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  const before = await readDurableSnapshot(page);
  const profileBefore = rawValue(before, profileKey(accountA.id));
  const coachBefore = rawValue(before, coachKey(accountA.id));
  const valuesBefore = valuesFor(before, accountA);
  const operationsBefore = operationsFor(before, accountA);
  const profileWritesBefore = [...fixture.counts.profileWrites];
  const coachStateWritesBefore = fixture.counts.stateWrites.filter(key => key === coachKey(accountA.id));
  const achievementChecksBefore = fixture.counts.achievementChecks;
  await retry.click();
  await expect.poll(() => fixture.counts.heldRequests).toBe(1);
  await expect.poll(() => page.evaluate(markerKey => localStorage.getItem(`${markerKey}:request`), marker)).toBe('started');

  await page.goto('about:blank');
  fixture.release();
  await expect.poll(() => fixture.counts.releasedResponses).toBe(1);
  expect(fixture.counts.achievementChecks).toBe(achievementChecksBefore);
  await page.goto(appOrigin);
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId).toBe(accountA.sid);
  await waitForAccountOutboxIdle(page, accountA);

  const after = await readDurableSnapshot(page);
  expect(rawValue(after, profileKey(accountA.id))).toBe(profileBefore);
  expect(rawValue(after, coachKey(accountA.id))).toBe(coachBefore);
  expect(valuesFor(after, accountA)).toEqual(valuesBefore);
  expect(operationsFor(after, accountA)).toEqual(operationsBefore);
  expect(fixture.counts.profileWrites).toEqual(profileWritesBefore);
  expect(fixture.counts.stateWrites.filter(key => key === coachKey(accountA.id))).toEqual(coachStateWritesBefore);
  expect(fixture.counts.aiRequests.filter(request => request.feature === 'coach_advice')).toEqual([{
    feature: 'coach_advice', account: accountA.id, session: accountA.sid,
  }]);
  expect(await page.evaluate(markerKey => ({
    request: localStorage.getItem(`${markerKey}:request`),
    signal: localStorage.getItem(`${markerKey}:signal`),
    beforeunload: localStorage.getItem(`${markerKey}:beforeunload`),
    pagehide: localStorage.getItem(`${markerKey}:pagehide`),
  }), marker)).toEqual({ request: 'started', signal: 'aborted', beforeunload: 'fired', pagehide: 'fired' });
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('navigation aborts the plateau AI request during session hydration before the daily task is committed', async ({ page }) => {
  const marker = '__e2e_hydration_plateau_unload__';
  await page.addInitScript(markerKey => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      let feature: unknown;
      try { feature = typeof init?.body === 'string' ? JSON.parse(init.body).feature : undefined; } catch { /* Ignore unrelated requests. */ }
      if (url.pathname === '/api/ai' && feature === 'plateau' && init?.signal) {
        mark('request', 'started');
        init.signal.addEventListener('abort', () => mark('signal', 'aborted'), { once: true });
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
    window.addEventListener('pagehide', () => mark('pagehide', 'fired'));
  }, marker);

  const diary = [{
    id: 'hydration-plateau-food', name: 'Завтрак', calories: 320, protein: 23, fat: 21, carbs: 4,
    timestamp: new Date().toISOString(),
  }];
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id, true),
    stateValues: [{
      accountId: accountA.id, key: diaryKey(accountA.id), value: JSON.stringify(diary), exists: true, version: 1,
    }, {
      accountId: accountA.id, key: `fitfocus_data_${accountA.id}_habits`, value: '[]', exists: true, version: 1,
    }],
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });

  const fixture = await installAccountApi(page, state, 'plateau');
  await openApp(page, '/#dashboard');
  await expect.poll(() => fixture.counts.heldRequests).toBe(1);
  await expect.poll(() => page.evaluate(markerKey => localStorage.getItem(`${markerKey}:request`), marker)).toBe('started');
  expect(fixture.counts.aiRequests).toEqual([{ feature: 'plateau', account: accountA.id, session: accountA.sid }]);
  const before = await readDurableSnapshot(page);
  const appOrigin = await page.evaluate(() => location.origin);

  await page.goto('about:blank');
  fixture.release();
  await expect.poll(() => fixture.counts.releasedResponses).toBe(1);
  await page.route('**/__e2e-idb-inspection', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body>IndexedDB inspection</body></html>',
  }));
  await page.goto(`${appOrigin}/__e2e-idb-inspection`);
  const after = await readDurableSnapshot(page);

  expect(after.values).toEqual(before.values);
  expect(after.operations).toEqual(before.operations);
  expect(after.activeSession).toEqual(before.activeSession);
  expect(fixture.counts.stateWrites).toEqual([]);
  expect(fixture.counts.profileWrites).toEqual([]);
  expect(fixture.counts.achievementChecks).toBe(0);
  expect(fixture.counts.aiRequests).toEqual([{ feature: 'plateau', account: accountA.id, session: accountA.sid }]);
  expect(await page.evaluate(markerKey => ({
    request: localStorage.getItem(`${markerKey}:request`),
    signal: localStorage.getItem(`${markerKey}:signal`),
    beforeunload: localStorage.getItem(`${markerKey}:beforeunload`),
    pagehide: localStorage.getItem(`${markerKey}:pagehide`),
  }), marker)).toEqual({ request: 'started', signal: 'aborted', beforeunload: 'fired', pagehide: 'fired' });
  expect(errors).toEqual([]);
});

test('a held hydration plateau response from account A cannot update account B after another tab signs in', async ({ page, context }, info) => {
  const diary = [{
    id: 'hydration-plateau-food', name: 'Завтрак', calories: 320, protein: 23, fat: 21, carbs: 4,
    timestamp: new Date().toISOString(),
  }];
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id, true),
    stateValues: [{
      accountId: accountA.id, key: diaryKey(accountA.id), value: JSON.stringify(diary), exists: true, version: 1,
    }, {
      accountId: accountA.id, key: `fitfocus_data_${accountA.id}_habits`, value: '[]', exists: true, version: 1,
    }],
  };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });

  const fixtureA = await installAccountApi(page, state, 'plateau');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'plateau')).toEqual([{
    feature: 'plateau', account: accountA.id, session: accountA.sid,
  }]);

  const beforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(beforeSwitch, profileKey(accountA.id));
  const valuesABefore = valuesFor(beforeSwitch, accountA);
  const operationsABefore = operationsFor(beforeSwitch, accountA);
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const stateWritesBefore = [...fixtureA.counts.stateWrites];
  const achievementChecksBefore = fixtureA.counts.achievementChecks;

  try {
    const switched = await openAccountB(context, state);
    await waitForAccountSwitch(page);
    await waitForAccountOutboxIdle(switched.page, accountB);
    const accountBBefore = await readDurableSnapshot(switched.page);
    const profileBBefore = rawValue(accountBBefore, profileKey(accountB.id));
    const valuesBBefore = valuesFor(accountBBefore, accountB);
    const operationsBBefore = operationsFor(accountBBefore, accountB);
    await expect(switched.page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);

    const finalA = await readDurableSnapshot(page);
    const finalB = await readDurableSnapshot(switched.page);
    expect(rawValue(finalA, profileKey(accountA.id))).toBe(profileABefore);
    expect(valuesFor(finalA, accountA)).toEqual(valuesABefore);
    expect(operationsFor(finalA, accountA)).toEqual(operationsABefore);
    expect(rawValue(finalB, profileKey(accountB.id))).toBe(profileBBefore);
    expect(valuesFor(finalB, accountB)).toEqual(valuesBBefore);
    expect(operationsFor(finalB, accountB)).toEqual(operationsBBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites).toEqual(stateWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'plateau')).toEqual([{
      feature: 'plateau', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('hydration-plateau-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('a held hydration plateau response cannot update a new session of the same account', async ({ page, context }, info) => {
  const diary = [{
    id: 'hydration-reauth-plateau-food', name: 'Завтрак', calories: 320, protein: 23, fat: 21, carbs: 4,
    timestamp: new Date().toISOString(),
  }];
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id, true),
    stateValues: [{
      accountId: accountA.id, key: diaryKey(accountA.id), value: JSON.stringify(diary), exists: true, version: 1,
    }, {
      accountId: accountA.id, key: `fitfocus_data_${accountA.id}_habits`, value: '[]', exists: true, version: 1,
    }],
  };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'plateau');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  const beforeReauthentication = await readDurableSnapshot(page);
  expect(beforeReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);
  expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'plateau')).toEqual([{
    feature: 'plateau', account: accountA.id, session: accountA.sid,
  }]);

  const nextSession: Account = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = nextSession;
  state.profile = profileFor(accountA.id, true);
  const reauthenticatedPage = await context.newPage();
  const reauthenticatedErrors: string[] = [];
  reauthenticatedPage.on('pageerror', error => reauthenticatedErrors.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) reauthenticatedErrors.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureNextSession = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#dashboard');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(nextSession.sid);
    await waitForAccountOutboxIdle(reauthenticatedPage, nextSession);
    const beforeLateResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(beforeLateResponse.activeSession?.accountId).toBe(accountA.id);
    expect(beforeLateResponse.activeSession?.sessionEpoch).not.toBe(beforeReauthentication.activeSession?.sessionEpoch);
    const profileBefore = rawValue(beforeLateResponse, profileKey(accountA.id));
    const valuesBefore = valuesFor(beforeLateResponse, accountA);
    const operationsBefore = operationsFor(beforeLateResponse, accountA);
    expect(fixtureNextSession.counts.aiRequests.filter(request => request.feature === 'plateau')
      .every(request => request.session === nextSession.sid)).toBe(true);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId).toBe(nextSession.sid);
    const afterLateResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterLateResponse, profileKey(accountA.id))).toBe(profileBefore);
    expect(valuesFor(afterLateResponse, accountA)).toEqual(valuesBefore);
    expect(operationsFor(afterLateResponse, accountA)).toEqual(operationsBefore);
    expect(fixtureA.counts.profileWrites).toEqual([]);
    expect(fixtureA.counts.stateWrites).toEqual([]);
    expect(fixtureA.counts.achievementChecks).toBe(0);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'plateau')).toEqual([{
      feature: 'plateau', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(reauthenticatedErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
    await reauthenticatedPage.screenshot({ path: info.outputPath('hydration-plateau-late-response-reauth.png') });
  } finally {
    fixtureA.release();
  }
});

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

test('held coach retry cannot write after the same account starts a new server session', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'coach_advice');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  await page.evaluate(({ key, accountId }) => {
    localStorage.setItem(key, JSON.stringify({ feature: 'coach_advice', type: 'coach', userId: accountId, actionId: 'seeded-same-session-coach' }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });
  const retry = page.getByRole('button', { name: 'Retry: Coach', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  await retry.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const coachBefore = rawValue(beforeReauthentication, coachKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const coachStateWritesBefore = fixtureA.counts.stateWrites.filter(key => key === coachKey(accountA.id));
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#dashboard');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionCoach = rawValue(beforeOldResponse, coachKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionCoach).toBe(coachBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    const aiActionKeyA = aiActionKey(accountA.id);
    const aiStatusKeyA = `fitfocus_data_${accountA.id}_ai_last_status_v1`;
    const retryMetadataBefore = await reauthenticatedPage.evaluate(keys => keys.map(key => localStorage.getItem(key)), [aiActionKeyA, aiStatusKeyA]);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(rawValue(afterOldResponse, coachKey(accountA.id))).toBe(newSessionCoach);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites.filter(key => key === coachKey(accountA.id))).toEqual(coachStateWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(await reauthenticatedPage.evaluate(keys => keys.map(key => localStorage.getItem(key)), [aiActionKeyA, aiStatusKeyA]))
      .toEqual(retryMetadataBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'coach_advice')).toEqual([{
      feature: 'coach_advice', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Поздний ответ A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздний ответ A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('AI Council uses account A proof and discards its held answer after account B signs in', async ({ page, context }, info) => {
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

test('AI Council discards its held answer after the same account starts a new server session', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'council_chairman');
  await openApp(page, '/#council');
  await expect(page.getByRole('heading', { name: 'AI Совет Экспертов' })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId).toBe(accountA.sid);
  const question = 'Ответ старой сессии не должен попасть в новый AI Совет';
  await page.getByPlaceholder('Ваш вопрос экспертам...').fill(question);
  await page.locator('form').getByRole('button').click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await waitForAccountOutboxIdle(page, accountA);
  const beforeReauthentication = await readDurableSnapshot(page);
  const councilBefore = rawValue(beforeReauthentication, councilKey(accountA.id));
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  expect(councilBefore).toContain(question);
  expect(beforeReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'e'.repeat(64) };
  state.current = reauthenticated;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#council');
    await expect(reauthenticatedPage.getByRole('heading', { name: 'AI Совет Экспертов' })).toBeVisible();
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);
    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const councilAtNewSession = rawValue(beforeOldResponse, councilKey(accountA.id));
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(councilAtNewSession).toBe(councilBefore);

    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, councilKey(accountA.id))).toBe(councilAtNewSession);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.aiRequests.filter(call => call.feature === 'council_chairman')).toEqual([{
      feature: 'council_chairman', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Поздний ответ AI Совета из аккаунта A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздний ответ AI Совета из аккаунта A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('AI Council hides its transient draft after the same account starts a new session in another tab', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(page, state);
  await openApp(page, '/#council');
  await expect(page.getByRole('heading', { name: 'AI Совет Экспертов' })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  const before = await readDurableSnapshot(page);
  const oldSessionEpoch = before.activeSession?.sessionEpoch;
  const question = 'Черновик не должен пережить новую сессию';
  const oldInput = page.getByPlaceholder('Ваш вопрос экспертам...');
  await oldInput.fill(question);

  const reauthenticated = { id: accountA.id, sid: 'c'.repeat(64) };
  state.current = reauthenticated;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(reauthenticatedPage, state);
  await openApp(reauthenticatedPage, '/#council');
  await expect(reauthenticatedPage.getByRole('heading', { name: 'AI Совет Экспертов' })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
    .toBe(reauthenticated.sid);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId)
    .toBe(reauthenticated.sid);

  const after = await readDurableSnapshot(reauthenticatedPage);
  expect(after.activeSession?.accountId).toBe(accountA.id);
  expect(after.activeSession?.sessionEpoch).not.toBe(oldSessionEpoch);
  await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
  await expect(oldInput).toHaveCount(0);
  await expect(reauthenticatedPage.getByPlaceholder('Ваш вопрос экспертам...')).toHaveValue('');
  const persistedCouncilHistory = rawValue(after, councilKey(accountA.id));
  expect(persistedCouncilHistory === null || !persistedCouncilHistory.includes(question)).toBe(true);
  expect(errorsA).toEqual([]);
  expect(errorsReauthenticated).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
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

test('held personal-plan retry cannot update the profile after same-account reauthentication', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
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
    localStorage.setItem(key, JSON.stringify({ feature: 'personal_plan', type: 'plan', userId: accountId, actionId: 'seeded-same-session-plan' }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });
  const retry = page.getByRole('button', { name: 'Retry: Plan', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  await retry.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  expect(beforeReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const stateWritesBefore = [...fixtureA.counts.stateWrites];
  const achievementChecksBefore = fixtureA.counts.achievementChecks;

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#dashboard');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites).toEqual(stateWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'personal_plan')).toEqual([{
      feature: 'personal_plan', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Поздний план A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздний план A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
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
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('plateau-retry-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held plateau retry cannot appear after the same account starts a new server session', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'The AI retry control is in desktop navigation.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id, true) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'plateau');
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  await page.evaluate(({ key, accountId }) => {
    localStorage.setItem(key, JSON.stringify({ feature: 'plateau', type: 'plateau', userId: accountId, actionId: 'seeded-same-session-plateau' }));
  }, { key: aiActionKey(accountA.id), accountId: accountA.id });
  const retry = page.getByRole('button', { name: 'Retry: Plateau', exact: true });
  await expect(retry).toBeVisible({ timeout: 5_000 });
  await retry.click();
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect(page.getByRole('button', { name: 'AI думает...', exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const coachBefore = rawValue(beforeReauthentication, coachKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const coachStateWritesBefore = fixtureA.counts.stateWrites.filter(key => key === coachKey(accountA.id));
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#dashboard');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionCoach = rawValue(beforeOldResponse, coachKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionCoach).toBe(coachBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    const aiActionKeyA = aiActionKey(accountA.id);
    const aiStatusKeyA = `fitfocus_data_${accountA.id}_ai_last_status_v1`;
    const retryMetadataBefore = await reauthenticatedPage.evaluate(keys => keys.map(key => localStorage.getItem(key)), [aiActionKeyA, aiStatusKeyA]);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(rawValue(afterOldResponse, coachKey(accountA.id))).toBe(newSessionCoach);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites.filter(key => key === coachKey(accountA.id))).toEqual(coachStateWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(await reauthenticatedPage.evaluate(keys => keys.map(key => localStorage.getItem(key)), [aiActionKeyA, aiStatusKeyA]))
      .toEqual(retryMetadataBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'plateau')).toEqual([{
      feature: 'plateau', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('held plateau explanation cannot appear after another tab signs in as account B', async ({ page, context }, info) => {
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
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('plateau-late-response-account-switch.png') });
  } finally {
    fixtureA.release();
  }
});

test('held plateau explanation cannot appear after the same account starts a new server session', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id, true) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
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
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const coachBefore = rawValue(beforeReauthentication, coachKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#dashboard');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI думает...', exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByRole('button', { name: 'AI думает...', exact: true })).toHaveCount(0);
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionCoach = rawValue(beforeOldResponse, coachKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionCoach).toBe(coachBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    const aiActionKeyA = aiActionKey(accountA.id);
    const aiStatusKeyA = `fitfocus_data_${accountA.id}_ai_last_status_v1`;
    const metadataBefore = await reauthenticatedPage.evaluate(keys => keys.map(key => localStorage.getItem(key)), [aiActionKeyA, aiStatusKeyA]);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(rawValue(afterOldResponse, coachKey(accountA.id))).toBe(newSessionCoach);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(await reauthenticatedPage.evaluate(keys => keys.map(key => localStorage.getItem(key)), [aiActionKeyA, aiStatusKeyA]))
      .toEqual(metadataBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'plateau')).toEqual([{
      feature: 'plateau', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Позднее объяснение плато из профиля A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('held personal weekly-menu response cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
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

test('held personal weekly-menu response cannot write after same-account reauthentication', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
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
  await waitForAccountOutboxIdle(page, accountA);
  const beforeReauthentication = await readDurableSnapshot(page);
  expect(beforeReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#plan');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();

    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);
    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const profileBefore = rawValue(beforeOldResponse, profileKey(accountA.id));
    const valuesBefore = valuesFor(beforeOldResponse, accountA);
    const operationsBefore = operationsFor(beforeOldResponse, accountA);
    const profileWritesBefore = [...fixtureA.counts.profileWrites];
    const stateWritesBefore = [...fixtureA.counts.stateWrites];
    const achievementChecksBefore = fixtureA.counts.achievementChecks;
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);
    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(profileBefore);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(valuesBefore);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(operationsBefore);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites.filter(key => key !== weeklyReportsKey(accountA.id)))
      .toEqual(stateWritesBefore.filter(key => key !== weeklyReportsKey(accountA.id)));
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'weekly_menu')).toEqual([{
      feature: 'weekly_menu', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Позднее меню A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Позднее меню A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('held weekly report cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'wis_text');
  await page.addInitScript(({ reportKey, report, settingsKey, settings }) => {
    localStorage.setItem(reportKey, JSON.stringify([report]));
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }, {
    reportKey: weeklyReportsKey(accountA.id),
    report: {
      weekKey: '1999-01',
      createdAt: '1999-01-01T00:00:00.000Z',
      data: { wis: 42, weightDelta7: 0, weightDelta30: 0, compliance: 50, adaptationIndex: 0, status: 'stable' },
      aiText: 'Сохранённый отчёт недели из аккаунта A',
    },
    settingsKey: `fitfocus_data_${accountA.id}_settings`,
    settings: { theme: 'violet', language: 'ru', soundEnabled: false, musicEnabled: false },
  });
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ffTheme)).toBe('violet');
  await expect(page.getByText('Профиль A', { exact: true })).toBeVisible();
  await expect(page.getByText('Сохранённый отчёт недели из аккаунта A', { exact: true })).toBeVisible();

  const reportKeyA = weeklyReportsKey(accountA.id);
  const reportKeyB = weeklyReportsKey(accountB.id);
  const beforeSwitch = await readDurableSnapshot(page);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  const reportABefore = rawValue(beforeSwitch, reportKeyA);
  const reportOperationsABefore = beforeSwitch.operations.filter(operation => operation.accountId === accountA.id && operation.key === reportKeyA);
  const reportWritesABefore = fixtureA.counts.stateWrites.filter(key => key === reportKeyA);

  try {
    const switched = await openAccountB(context, state);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountB.id);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ffTheme)).toBe('dark');
    await expect(page.getByText('Профиль A', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Сохранённый отчёт недели из аккаунта A', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Сохранённый отчёт недели из аккаунта A', { exact: true })).toHaveCount(0);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    await expect.poll(() => switched.fixture.counts.completedAiFeatures).toContain('wis_text');
    await expect.poll(async () => {
      const snapshot = await readDurableSnapshot(switched.page);
      return {
        reportSaved: rawValue(snapshot, reportKeyB) !== null,
        pendingOperations: snapshot.operations.filter(operation => operation.accountId === accountB.id
          && operation.key === reportKeyB).length,
      };
    }).toEqual({ reportSaved: true, pendingOperations: 0 });
    const beforeB = await readDurableSnapshot(switched.page);
    expect(beforeB.activeSession?.accountId).toBe(accountB.id);
    const reportBBefore = rawValue(beforeB, reportKeyB);
    const reportOperationsBBefore = beforeB.operations.filter(operation => operation.accountId === accountB.id && operation.key === reportKeyB);
    expect(reportBBefore).not.toBeNull();
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

test('held weekly report cannot write after the same account starts a new server session', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'wis_text');
  await page.addInitScript(({ reportKey, report, settingsKey, settings }) => {
    localStorage.setItem(reportKey, JSON.stringify([report]));
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }, {
    reportKey: weeklyReportsKey(accountA.id),
    report: {
      weekKey: '1999-01',
      createdAt: '1999-01-01T00:00:00.000Z',
      data: { wis: 42, weightDelta7: 0, weightDelta30: 0, compliance: 50, adaptationIndex: 0, status: 'stable' },
      aiText: 'Сохранённый отчёт недели из старой сессии',
    },
    settingsKey: `fitfocus_data_${accountA.id}_settings`,
    settings: { theme: 'violet', language: 'ru', soundEnabled: false, musicEnabled: false },
  });
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ffTheme)).toBe('violet');
  await expect(page.getByText('Профиль A', { exact: true })).toBeVisible();
  await expect(page.getByText('Сохранённый отчёт недели из старой сессии', { exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);

  const reportKey = weeklyReportsKey(accountA.id);
  const beforeReauthentication = await readDurableSnapshot(page);
  const oldReport = rawValue(beforeReauthentication, reportKey);
  expect(beforeReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);
  const oldSessionReportWrites = fixtureA.counts.stateWrites.filter(key => key === reportKey);

  const reauthenticated = { id: accountA.id, sid: 'f'.repeat(64) };
  state.current = reauthenticated;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#dashboard');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();

    // A new login must be able to replace the stale in-flight marker and create its own report.
    await expect.poll(() => fixtureReauthenticated.counts.completedAiFeatures).toContain('wis_text');
    await expect.poll(() => fixtureReauthenticated.counts.stateWrites.filter(key => key === reportKey)).toHaveLength(1);
    await waitForOutboxKeyIdle(reauthenticatedPage, reauthenticated, reportKey);
    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const reportAtNewSession = rawValue(beforeOldResponse, reportKey);
    expect(beforeOldResponse.activeSession?.accountId).toBe(accountA.id);
    expect(beforeOldResponse.activeSession?.serverSessionId).toBe(reauthenticated.sid);
    expect(reportAtNewSession).not.toBeNull();
    expect(reportAtNewSession).not.toBe(oldReport);
    const reportOperationsAtNewSession = beforeOldResponse.operations
      .filter(operation => operation.accountId === accountA.id && operation.key === reportKey);
    const operationsAtNewSession = operationsFor(beforeOldResponse, accountA);
    const newSessionReportWrites = fixtureReauthenticated.counts.stateWrites.filter(key => key === reportKey);

    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);
    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, reportKey)).toBe(reportAtNewSession);
    expect(afterOldResponse.operations.filter(operation => operation.accountId === accountA.id && operation.key === reportKey))
      .toEqual(reportOperationsAtNewSession);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(operationsAtNewSession);
    expect(fixtureA.counts.stateWrites.filter(key => key === reportKey)).toEqual(oldSessionReportWrites);
    expect(fixtureReauthenticated.counts.stateWrites.filter(key => key === reportKey)).toEqual(newSessionReportWrites);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'wis_text')).toEqual([{
      feature: 'wis_text', account: accountA.id, session: accountA.sid,
    }]);
    expect(fixtureReauthenticated.counts.aiRequests.filter(request => request.feature === 'wis_text')).toEqual([{
      feature: 'wis_text', account: accountA.id, session: reauthenticated.sid,
    }]);
    await expect(page.getByText('Поздний отчёт недели из аккаунта A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздний отчёт недели из аккаунта A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

async function expectHeldFoodPhotoCannotWriteAfterAccountSwitch(
  page: Page,
  context: BrowserContext,
  info: TestInfo,
  uploadSelector: string,
) {
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
  const upload = page.locator(uploadSelector).first();
  await expect(upload).toHaveCount(1);
  await upload.setInputFiles({
    name: 'meal.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });
  await expect.poll(() => fixtureA.counts.heldRequests).toBe(1);
  await expect(page.getByText('Анализирую фото...', { exact: true })).toBeVisible();

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
    await waitForAccountSwitch(page);
    await expect(page.getByText('Анализирую фото...', { exact: true })).toHaveCount(0);
    await expect(switched.page.getByText('Анализирую фото...', { exact: true })).toHaveCount(0);
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
}

test('held food photo analysis cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  await expectHeldFoodPhotoCannotWriteAfterAccountSwitch(page, context, info, 'input[type="file"][multiple]');
});

test('held native camera capture cannot write for account A after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('iphone-') && !info.project.name.startsWith('android-'),
    'The native camera capture input is available on phone browser profiles.');
  await expectHeldFoodPhotoCannotWriteAfterAccountSwitch(page, context, info, 'input[type="file"][capture]');
});

test('held food photo analysis cannot commit after the same account starts a new server session', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
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
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  const diaryKeys = [diaryKey(accountA.id), historyKey(accountA.id)];
  const diaryAndHistoryWritesBefore = fixtureA.counts.stateWrites.filter(key => diaryKeys.includes(key));
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  expect(beforeReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);
  expect(JSON.parse(rawValue(beforeReauthentication, diaryKey(accountA.id)) ?? '[]'))
    .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Поздняя еда A' })]));

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#nutrition');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites.filter(key => diaryKeys.includes(key)))
      .toEqual(diaryAndHistoryWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'foodphoto')).toEqual([{
      feature: 'foodphoto', account: accountA.id, session: accountA.sid,
    }]);
    const diary = JSON.parse(rawValue(afterOldResponse, diaryKey(accountA.id)) ?? '[]');
    const history = JSON.parse(rawValue(afterOldResponse, historyKey(accountA.id)) ?? '[]');
    expect(diary).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Поздняя еда A' })]));
    expect(history).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Поздняя еда A' })]));
    await expect(page.getByText('Поздняя еда A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздняя еда A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

async function expectHeldRecipePhotoCannotCreateStaleDraftAfterAccountSwitch(
  page: Page,
  context: BrowserContext,
  info: TestInfo,
  uploadSelector: string,
) {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state, 'foodphoto_enhanced');
  await openApp(page, '/#recipes');
  await expect(page).toHaveTitle(/FitFocus/);
  const fileInput = page.locator(uploadSelector).first();
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
}

test('held recipe photo analysis cannot create a stale draft after another tab signs in as account B', async ({ page, context }, info) => {
  await expectHeldRecipePhotoCannotCreateStaleDraftAfterAccountSwitch(
    page, context, info, 'input[type="file"][accept="image/*"]:not([capture])',
  );
});

test('held native recipe camera capture cannot create a stale draft after another tab signs in as account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('iphone-') && !info.project.name.startsWith('android-'),
    'The native camera capture input is available on phone browser profiles.');
  await expectHeldRecipePhotoCannotCreateStaleDraftAfterAccountSwitch(
    page, context, info, 'input[type="file"][accept="image/*"][capture]',
  );
});

test('held recipe photo analysis cannot create a draft after the same account starts a new server session', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
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
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#recipes');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    await expect(reauthenticatedPage.getByText('Поздний рецепт A', { exact: true })).toHaveCount(0);
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'foodphoto_enhanced')).toEqual([{
      feature: 'foodphoto_enhanced', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Поздний рецепт A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздний рецепт A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('a scoped auth refusal during recipe photo analysis does not show an ordinary recipe error', async ({ page }) => {
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    unauthorizedAiFeature: 'foodphoto_enhanced',
  };
  const pageErrors: string[] = [];
  const dialogs: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });

  const fixture = await installAccountApi(page, state);
  await openApp(page, '/#recipes');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const photoInput = page.locator('input[type="file"]').nth(1);
  await expect(photoInput).toHaveCount(1);
  await photoInput.setInputFiles({
    name: 'unauthorized-recipe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>'),
  });

  await expect.poll(() => fixture.counts.aiRequests.filter(request => request.feature === 'foodphoto_enhanced'))
    .toEqual([{ feature: 'foodphoto_enhanced', account: accountA.id, session: accountA.sid }]);
  await expect(page.getByText('Новое блюдо', { exact: true })).toHaveCount(0);
  expect(fixture.counts.completedAiFeatures).not.toContain('foodphoto_enhanced');
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('an unsaved recipe draft from account A is cleared when another tab activates account B', async ({ page, context }, info) => {
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
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  const failedStateRequests: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      errorsA.push(`${message.type()}: ${message.text()} @ ${JSON.stringify(message.location())}`);
    }
  });
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname === '/api/state') {
      failedStateRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`);
    }
  });
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#progress');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByRole('heading', { name: 'Новый замер', exact: true })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect.poll(async () => rawValue(await readDurableSnapshot(page), profileKey(accountA.id))).not.toBeNull();
  await waitForAccountOutboxIdle(page, accountA);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await expect.poll(async () => rawValue(await readDurableSnapshot(page), weeklyReportsKey(accountA.id))).not.toBeNull();
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
  if (!info.project.name.startsWith('desktop-')) {
    await page.getByRole('button', { name: 'Детали', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Сахар', exact: true })).toHaveClass(/border-indigo-500/);
  await waitForAccountOutboxIdle(page, accountA);

  const weightDraft = page.getByLabel('Вес');
  await weightDraft.fill('98.765');
  await expect(weightDraft).toHaveValue('98.765');
  const progressUiCacheBeforeSwitch = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), progressUiKeyA);
  expect(progressUiCacheBeforeSwitch.selectedMetric).toBe('bloodGlucoseMmolL');
  const beforeSwitch = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeSwitch, profileKey(accountA.id));
  const operationsBefore = operationsFor(beforeSwitch, accountA);
  expect(beforeSwitch.activeSession?.accountId).toBe(accountA.id);
  expect(errorsA).toEqual([]);

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(weightDraft).toHaveCount(0);
  const progressUiCacheAfterSwitch = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), progressUiKeyA);
  // activeSection follows the viewport through IntersectionObserver; opening
  // the second tab can move it without changing the account-scoped preferences.
  expect(progressUiCacheAfterSwitch).toMatchObject({
    selectedMetric: progressUiCacheBeforeSwitch.selectedMetric,
    mobileDetailsOpen: progressUiCacheBeforeSwitch.mobileDetailsOpen,
    timelineFilter: progressUiCacheBeforeSwitch.timelineFilter,
    compareFromKey: progressUiCacheBeforeSwitch.compareFromKey,
    compareToKey: progressUiCacheBeforeSwitch.compareToKey,
    compareMode: progressUiCacheBeforeSwitch.compareMode,
  });

  const afterSwitch = await readDurableSnapshot(page);
  expect(afterSwitch.activeSession?.accountId).toBe(accountB.id);
  expect(rawValue(afterSwitch, profileKey(accountA.id))).toBe(profileBefore);
  expect(operationsFor(afterSwitch, accountA)).toEqual(operationsBefore);
  expect(errorsA, `Failed /api/state requests: ${JSON.stringify(failedStateRequests)}`).toEqual([]);
  expect(await switched.page.getByText('98.765', { exact: true }).count()).toBe(0);
  expect(fixtureA.counts.profileWrites).toEqual([]);
  // WebKit reports an access-control error when account activation aborts the
  // old page's in-flight automatic AI request. Keep this allowlist exact and
  // limited to that transition; all other errors remain fatal.
  const expectedWebKitAiAbort = (error: string) => info.project.name === 'desktop-webkit'
    && /^error: \/127\.0\.0\.1:\d+\/api\/ai due to access control checks\.$/.test(error);
  const expectedWebKitAiAborts = errorsA.filter(expectedWebKitAiAbort);
  expect(expectedWebKitAiAborts.length).toBeLessThanOrEqual(info.project.name === 'desktop-webkit' ? 1 : 0);
  expect(errorsA.filter(error => !expectedWebKitAiAborts.includes(error))).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('progress-draft-cleared-on-account-switch.png') });
});

test('progress archive expansion cached for account A is not restored after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixtureA = await installAccountApi(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, '/#progress');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await expect.poll(async () => rawValue(await readDurableSnapshot(page), weeklyReportsKey(accountA.id))).not.toBeNull();
  await waitForAccountOutboxIdle(page, accountA);

  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Визуальная история тела', exact: true })).toBeVisible();
  const archiveKeyA = `fitfocus.progress-archive.sections.v1:${accountA.id}`;
  const galleryToggleA = page.getByRole('button', { name: 'Показать', exact: true }).first();
  await expect(galleryToggleA).toBeVisible();
  await galleryToggleA.click();
  await expect(page.getByRole('button', { name: 'Скрыть', exact: true }).first()).toBeVisible();
  const archiveStateA = { gallery: true, compare: false, trend: false, timeline: false };
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), archiveKeyA))
    .toBe(JSON.stringify(archiveStateA));
  const beforeSwitch = await readDurableSnapshot(page);
  const profileBefore = rawValue(beforeSwitch, profileKey(accountA.id));
  const operationsBefore = operationsFor(beforeSwitch, accountA);

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(page.getByRole('heading', { name: 'Визуальная история тела', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), archiveKeyA)).toBe(JSON.stringify(archiveStateA));
  const afterSwitch = await readDurableSnapshot(page);
  expect(rawValue(afterSwitch, profileKey(accountA.id))).toBe(profileBefore);
  expect(operationsFor(afterSwitch, accountA)).toEqual(operationsBefore);

  await switched.page.setViewportSize({ width: 390, height: 844 });
  await openApp(switched.page, '/#progress');
  await expect.poll(async () => (await readDurableSnapshot(switched.page)).activeSession?.accountId).toBe(accountB.id);
  await expect.poll(() => switched.fixture.counts.completedAiFeatures).toContain('wis_text');
  await expect.poll(async () => rawValue(await readDurableSnapshot(switched.page), weeklyReportsKey(accountB.id))).not.toBeNull();
  await waitForAccountOutboxIdle(switched.page, accountB);
  await switched.page.getByRole('button', { name: 'Архив', exact: true }).click();
  await expect(switched.page.getByRole('heading', { name: 'Визуальная история тела', exact: true })).toBeVisible();
  await expect(switched.page.getByRole('button', { name: 'Показать', exact: true }).first()).toBeVisible();
  await expect(switched.page.getByRole('button', { name: 'Скрыть', exact: true })).toHaveCount(0);
  expect(await switched.page.evaluate(key => localStorage.getItem(key), archiveKeyA)).toBe(JSON.stringify(archiveStateA));
  expect(await switched.page.evaluate(key => localStorage.getItem(key), `fitfocus.progress-archive.sections.v1:${accountB.id}`))
    .toBe(JSON.stringify({ gallery: false, compare: false, trend: false, timeline: false }));
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('progress-archive-account-b-default-state.png') });
});

test('a profile draft cached for account A is not restored after another tab activates account B', async ({ page, context }, info) => {
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
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(page.getByPlaceholder('Как к вам обращаться')).toHaveCount(0);

  const cachedDraft = await page.evaluate(key => localStorage.getItem(key), settingsKeyA);
  expect(cachedDraft).toContain('"profileDirty":true');
  expect(cachedDraft).toContain('Черновик настроек аккаунта A');
  await switched.page.goto('/#settings');
  await expect(switched.page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Профиль B');
  expect(fixtureA.counts.profileWrites).toEqual([]);
});

test('a profile draft stays hidden in a retired same-account session and restores after reauthentication', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.serverSessionId).toBe(accountA.sid);

  const nameDraft = page.getByPlaceholder('Как к вам обращаться');
  await expect(nameDraft).toHaveValue('Профиль A');
  await nameDraft.fill('Черновик после повторного входа A');
  const settingsKeyA = `fitfocus.settings.ui.v1:${accountA.id}`;
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), settingsKeyA))
    .toContain('Черновик после повторного входа A');
  const snapshotBeforeReauthentication = await readDurableSnapshot(page);
  const profileBeforeReauthentication = rawValue(snapshotBeforeReauthentication, profileKey(accountA.id));

  const reauthenticated = { id: accountA.id, sid: 'd'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);
  await openApp(reauthenticatedPage, '/#dashboard');
  await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
    .toBe(reauthenticated.sid);

  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(page.getByPlaceholder('Как к вам обращаться')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), settingsKeyA))
    .toContain('Черновик после повторного входа A');

  await reauthenticatedPage.goto('/#settings');
  await expect(reauthenticatedPage.getByPlaceholder('Как к вам обращаться'))
    .toHaveValue('Черновик после повторного входа A');
  const snapshotAfterReauthentication = await readDurableSnapshot(reauthenticatedPage);
  expect(rawValue(snapshotAfterReauthentication, profileKey(accountA.id))).toBe(profileBeforeReauthentication);
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(fixtureReauthenticated.counts.profileWrites).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  await reauthenticatedPage.screenshot({ path: info.outputPath('same-account-settings-draft-restored.png') });
});

test('a dashboard weight draft cached for account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const weightDraft = page.getByLabel('Вес сегодня');
  const includeMealLog = page.getByRole('checkbox', { name: 'Детально: лог еды' });
  await weightDraft.fill('98.765');
  const weightDraftKeyA = `fitfocus.dashboard.new-weight.v1:${accountA.id}`;
  const includeMealLogKeyA = `fitfocus.dashboard.pdf-include-meal-log.v1:${accountA.id}`;
  const includeMealLogKeyB = `fitfocus.dashboard.pdf-include-meal-log.v1:${accountB.id}`;
  await expect(includeMealLog).not.toBeChecked();
  await includeMealLog.check();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), includeMealLogKeyA)).toBe('1');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), weightDraftKeyA)).toBe('98.765');

  await page.reload();
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByLabel('Вес сегодня')).toHaveValue('98.765', { timeout: 30_000 });
  await expect(page.getByRole('checkbox', { name: 'Детально: лог еды' })).toBeChecked();

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(weightDraft).toHaveCount(0);
  await expect(includeMealLog).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), weightDraftKeyA)).toBe('98.765');
  expect(await page.evaluate(key => localStorage.getItem(key), includeMealLogKeyA)).toBe('1');
  await expect(switched.page.getByLabel('Вес сегодня')).not.toHaveValue('98.765');
  const includeMealLogForB = switched.page.getByRole('checkbox', { name: 'Детально: лог еды' });
  await expect(includeMealLogForB).not.toBeChecked();
  expect(await switched.page.evaluate(key => localStorage.getItem(key), includeMealLogKeyB)).not.toBe('1');
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(switched.errors).toEqual([]);
});

test('a nutrition search cached for account A stays private after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const search = page.getByPlaceholder('Поиск блюда в истории...');
  const queryA = 'аллергены и ограничения аккаунта A';
  const searchKeyA = `fitfocus.nutrition.search.v1:${accountA.id}`;
  const searchKeyB = `fitfocus.nutrition.search.v1:${accountB.id}`;
  await search.fill(queryA);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), searchKeyA))
    .toBe(JSON.stringify({ query: queryA, open: true }));

  await page.reload();
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByPlaceholder('Поиск блюда в истории...')).toHaveValue(queryA, { timeout: 30_000 });

  const switched = await openAccountB(context, state, true, '/#nutrition');
  await waitForAccountSwitch(page);
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(search).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), searchKeyA))
    .toBe(JSON.stringify({ query: queryA, open: true }));
  const searchForB = switched.page.getByPlaceholder('Поиск блюда в истории...');
  await expect.poll(() => switched.page.evaluate(key => localStorage.getItem(key), searchKeyB))
    .toBe(JSON.stringify({ query: '', open: false }));
  await expect(searchForB).toHaveValue('');
  expect(await switched.page.evaluate(key => localStorage.getItem(key), searchKeyB)).not.toContain(queryA);
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(switched.errors).toEqual([]);
});

test('a selected weekly-menu day cached for account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const baseProfileA = profileFor(accountA.id);
  const state: FixtureState = {
    current: accountA,
    profile: Object.assign({}, baseProfileA, {
      aiPlan: {
        ...baseProfileA.aiPlan,
        weeklyMenu: {
          days: ['Понедельник', 'Вторник'].map(day => ({
            day,
            breakfast: 'Овсянка',
            lunch: 'Курица с рисом',
            dinner: 'Рыба с овощами',
            snack: 'Йогурт',
          })),
          shoppingList: [],
        },
      },
    }),
  };
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#plan');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const activeDayKeyA = `fitfocus.plan.active-day.v1:${accountA.id}`;
  const monday = page.getByRole('button', { name: 'Понедельник', exact: true });
  const tuesday = page.getByRole('button', { name: 'Вторник', exact: true });
  await expect(monday).toBeVisible();
  await tuesday.click();
  await expect(tuesday).toHaveClass(/bg-indigo-500\/20/);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), activeDayKeyA)).toBe('Вторник');

  await page.reload();
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  await expect(page.getByRole('button', { name: 'Вторник', exact: true })).toHaveClass(/bg-indigo-500\/20/);

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(monday).toHaveCount(0);
  await expect(tuesday).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), activeDayKeyA)).toBe('Вторник');
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(switched.errors).toEqual([]);
});

test('a course lesson and quiz cached for account A stay hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state);
  const courseUiKeyA = `fitfocus.course.ui.v1:${accountA.id}`;
  const courseUiStateA = {
    lessonId: 'l2_hunger',
    isLessonViewOpen: true,
    isQuizActive: true,
    selectedQuizOptionId: 'opt_habits',
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: courseUiKeyA,
    value: courseUiStateA,
  });
  await openApp(page, '/#course');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);

  const quizQuestion = page.getByRole('heading', {
    name: 'Что ты возьмёшь с собой из этого урока сегодня?', exact: true,
  });
  const selectedAnswer = page.getByRole('button', {
    name: 'Сфокусируюсь на воде и шагах', exact: true,
  });
  await expect(quizQuestion).toBeVisible();
  await expect(selectedAnswer).toHaveClass(/border-indigo-500/);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), courseUiKeyA))
    .toBe(JSON.stringify(courseUiStateA));
  await page.screenshot({ path: info.outputPath('course-quiz-account-a-before-switch.png') });

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  await expect(page.getByText(/Сессия изменилась в другой вкладке/)).toBeVisible();
  await expect(quizQuestion).toHaveCount(0);
  await expect(selectedAnswer).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), courseUiKeyA))
    .toBe(JSON.stringify(courseUiStateA));

  await switched.page.goto('/#course');
  await expect(switched.page.getByRole('heading', { name: 'Обучение', exact: true })).toBeVisible();
  await expect(switched.page.getByRole('heading', {
    name: 'Что ты возьмёшь с собой из этого урока сегодня?', exact: true,
  })).toHaveCount(0);
  expect(await switched.page.evaluate(key => localStorage.getItem(key), `fitfocus.course.ui.v1:${accountB.id}`))
    .not.toContain('l2_hunger');
  expect(fixtureA.counts.profileWrites).toEqual([]);
  expect(errorsA).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('course-account-b-after-switch.png') });
});

test('AI activity cached for account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  await installAccountApi(page, state);
  const aiStatusKeyA = `fitfocus_data_${accountA.id}_ai_last_status_v1`;
  const aiActionKeyA = `fitfocus_data_${accountA.id}_ai_last_action_v1`;
  const cachedStatusA = { ts: Date.now(), feature: 'coach_advice', source: 'live' };
  const cachedActionA = { feature: 'coach_advice', type: 'coach', userId: accountA.id, actionId: 'cached-action-a' };
  await page.addInitScript(({ statusKey, status, actionKey, action }) => {
    localStorage.setItem(statusKey, JSON.stringify(status));
    localStorage.setItem(actionKey, JSON.stringify(action));
  }, {
    statusKey: aiStatusKeyA,
    status: cachedStatusA,
    actionKey: aiActionKeyA,
    action: cachedActionA,
  });
  const aiStatusKeyB = `fitfocus_data_${accountB.id}_ai_last_status_v1`;
  const aiActionKeyB = `fitfocus_data_${accountB.id}_ai_last_action_v1`;
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  if (info.project.name.startsWith('desktop-')) {
    await expect(page.getByText('AI: online', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry: Coach', exact: true })).toBeVisible();
  }

  const switched = await openAccountB(context, state);
  await waitForAccountSwitch(page);
  const [statusAAfterSwitch, actionAAfterSwitch, statusBAfterSwitch, actionBAfterSwitch] = await switched.page.evaluate(
    keys => keys.map(key => localStorage.getItem(key)),
    [aiStatusKeyA, aiActionKeyA, aiStatusKeyB, aiActionKeyB],
  );
  expect(statusAAfterSwitch).not.toBeNull();
  expect(JSON.parse(actionAAfterSwitch ?? 'null').userId).toBe(accountA.id);
  expect(statusBAfterSwitch).not.toBe(JSON.stringify(cachedStatusA));
  expect(actionBAfterSwitch).not.toBe(JSON.stringify(cachedActionA));
  if (actionBAfterSwitch !== null) {
    expect(JSON.parse(actionBAfterSwitch).userId).toBe(accountB.id);
  }
  if (info.project.name.startsWith('desktop-')) {
    await expect(page.getByText('AI: online', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry: Coach', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  }
  expect(switched.errors).toEqual([]);
});

test('an open food insight from account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  await page.locator('input[type="file"][multiple]').first().setInputFiles({
    name: 'meal.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'),
  });
  await expect(page.getByText('Тестовый омлет', { exact: true }).first()).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);
  await expect(page.getByText('Разбор по фото: Тестовый омлет', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Корректировать', exact: true }).click();
  await expect(page.getByText('Корректировать блюдо', { exact: true })).toBeVisible();

  const switched = await openAccountB(context, state, true, '/#nutrition');
  await waitForAccountSwitch(page);
  await expect(page.getByText('Разбор по фото: Тестовый омлет', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Корректировать блюдо', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Тестовый омлет', { exact: true })).toHaveCount(0);
  const afterSwitch = await readDurableSnapshot(page);
  expect(afterSwitch.activeSession?.accountId).toBe(accountB.id);
  expect(JSON.parse(rawValue(afterSwitch, diaryKey(accountA.id)) ?? '[]'))
    .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Тестовый омлет' })]));
  expect(rawValue(afterSwitch, diaryKey(accountB.id))).toBeNull();
  await expect(switched.page).toHaveURL(/#nutrition$/);
  await expect(switched.page.getByText('Тестовый омлет', { exact: true })).toHaveCount(0);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('an open camera dialog from account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('desktop-'), 'Mobile profiles use a native capture input instead of the in-app camera dialog.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  await page.getByRole('button', { name: 'Снять', exact: true }).click();
  await expect(page.getByText('Камера', { exact: true })).toBeVisible();

  const switched = await openAccountB(context, state, true, '/#nutrition');
  await waitForAccountSwitch(page);
  await expect(page.getByText('Камера', { exact: true })).toHaveCount(0);
  await expect(switched.page.getByText('Камера', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('camera-dialog-hidden-after-account-switch.png') });
});

test('an open paywall from account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installAccountApi(page, state);
  await openApp(page, '/#pro');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  await page.getByRole('button', { name: 'Выбрать тарифный план', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тарифы', exact: true })).toBeVisible();

  const switched = await openAccountB(context, state, true, '/#pro');
  await waitForAccountSwitch(page);
  await expect(page.getByRole('heading', { name: 'Тарифы', exact: true })).toHaveCount(0);
  await expect(switched.page.getByRole('heading', { name: 'Тарифы', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('paywall-hidden-after-account-switch.png') });
});

test('an open paywall from a retired session is hidden after same-account reauthentication', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installAccountApi(page, state);
  await openApp(page, '/#pro');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);
  const beforeReauthentication = await readDurableSnapshot(page);

  await page.getByRole('button', { name: 'Выбрать тарифный план', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тарифы', exact: true })).toBeVisible();

  const renewedAccountA = { id: accountA.id, sid: 'c'.repeat(64) };
  state.current = renewedAccountA;
  state.profile = profileFor(accountA.id);
  const reauthenticatedPage = await context.newPage();
  const reauthenticatedErrors: string[] = [];
  reauthenticatedPage.on('pageerror', error => reauthenticatedErrors.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) reauthenticatedErrors.push(message.text());
  });
  await installAccountApi(reauthenticatedPage, state);
  await openApp(reauthenticatedPage, '/#pro');
  await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
  await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
    .toBe(renewedAccountA.sid);
  const afterReauthentication = await readDurableSnapshot(reauthenticatedPage);
  expect(afterReauthentication.activeSession?.accountId).toBe(accountA.id);
  expect(afterReauthentication.activeSession?.sessionEpoch).not.toBe(beforeReauthentication.activeSession?.sessionEpoch);

  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(page.getByRole('heading', { name: 'Тарифы', exact: true })).toHaveCount(0);
  await expect(reauthenticatedPage.getByRole('heading', { name: 'Тарифы', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(reauthenticatedErrors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  await reauthenticatedPage.screenshot({ path: info.outputPath('same-account-paywall-hidden-after-reauthentication.png') });
});

test('a profile sync notice from account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installAccountApi(page, state);
  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  const profileName = page.getByPlaceholder('Как к вам обращаться');
  await expect(profileName).toHaveValue('Профиль A');
  await waitForAccountOutboxIdle(page, accountA);

  state.profile = { ...profileFor(accountA.id), name: 'Облачный профиль A', version: 5 };
  await page.getByRole('button', { name: /Перезагрузить из облака/ }).click();
  await expect(profileName).toHaveValue('Облачный профиль A');
  await expect(page.getByText('Профиль обновлён из облака.', { exact: true })).toBeVisible();

  const switched = await openAccountB(context, state, true, '/#settings');
  await waitForAccountSwitch(page);
  await expect(page.getByText('Профиль обновлён из облака.', { exact: true })).toHaveCount(0);
  await expect(switched.page.getByText('Профиль обновлён из облака.', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('profile-sync-notice-hidden-after-account-switch.png') });
});

test('a progress photo decode released after account switch cannot update account B profile', async ({ page, context }) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errorsA.push(message.text()); });
  const fixtureA = await installAccountApi(page, state);

  await installProgressPhotoDecodeGate(page);

  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByText('История визуальных замеров', { exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);
  const before = await readDurableSnapshot(page);
  const profileABefore = rawValue(before, profileKey(accountA.id));
  const valuesBefore = valuesFor(before, accountA);
  const operationsBefore = operationsFor(before, accountA);
  await selectHeldProgressPhoto(page, 'Черновик фото аккаунта A');

  const switched = await openAccountB(context, state, true, '/#settings');
  const snapshotB = await readDurableSnapshot(switched.page);
  const profileBBeforeRelease = rawValue(snapshotB, profileKey(accountB.id));
  await waitForAccountSwitch(page);
  const profileWritesBeforeRelease = [...fixtureA.counts.profileWrites];
  const stateWritesBeforeRelease = [...fixtureA.counts.stateWrites];
  await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
  await expect(page.getByText('Черновик фото аккаунта A', { exact: true })).toHaveCount(0);
  await expect(switched.page.getByText('Черновик фото аккаунта A', { exact: true })).toHaveCount(0);

  await releaseHeldProgressPhoto(page);
  await waitForAccountOutboxIdle(page, accountA);
  const after = await readDurableSnapshot(page);
  expect(after.activeSession?.accountId).toBe(accountB.id);
  expect(rawValue(after, profileKey(accountA.id))).toBe(profileABefore);
  expect(rawValue(after, profileKey(accountB.id))).toBe(profileBBeforeRelease);
  expect(valuesFor(after, accountA)).toEqual(valuesBefore);
  expect(operationsFor(after, accountA)).toEqual(operationsBefore);
  expect(fixtureA.counts.profileWrites).toEqual(profileWritesBeforeRelease);
  expect(fixtureA.counts.stateWrites).toEqual(stateWritesBeforeRelease);
  await expect(page.getByAltText('Последнее фото прогресса')).toHaveCount(0);
  await expect(switched.page.getByAltText('Последнее фото прогресса')).toHaveCount(0);
  expect(errorsA).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
});

test('a progress photo decode released after same-account reauthentication cannot update the renewed profile session', async ({ page, context }) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errorsA.push(message.text()); });
  const fixtureA = await installAccountApi(page, state);
  await installProgressPhotoDecodeGate(page);

  await openApp(page, '/#settings');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(page.getByText('История визуальных замеров', { exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);
  const before = await readDurableSnapshot(page);
  const profileBefore = rawValue(before, profileKey(accountA.id));
  const valuesBefore = valuesFor(before, accountA);
  const operationsBefore = operationsFor(before, accountA);
  await selectHeldProgressPhoto(page, 'Черновик фото прежней сессии');

  const reauthenticated = { id: accountA.id, sid: 'c'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  const errorsReauthenticated: string[] = [];
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (message.type() === 'error') errorsReauthenticated.push(message.text());
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);
  await openApp(reauthenticatedPage, '/#settings');
  await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
  await expect(reauthenticatedPage.getByText('История визуальных замеров', { exact: true })).toBeVisible();
  const renewedSnapshot = await readDurableSnapshot(reauthenticatedPage);
  expect(renewedSnapshot.activeSession?.accountId).toBe(accountA.id);
  expect(renewedSnapshot.activeSession?.serverSessionId).toBe(reauthenticated.sid);
  expect(renewedSnapshot.activeSession?.sessionEpoch).not.toBe(before.activeSession?.sessionEpoch);
  expect(rawValue(renewedSnapshot, profileKey(accountA.id))).toBe(profileBefore);
  const profileWritesBeforeRelease = [...fixtureA.counts.profileWrites];
  const stateWritesBeforeRelease = [...fixtureA.counts.stateWrites];
  await waitForAccountOutboxIdle(reauthenticatedPage, accountA);
  await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
  await expect(page.getByText('Черновик фото прежней сессии', { exact: true })).toHaveCount(0);
  await expect(reauthenticatedPage.getByText('Черновик фото прежней сессии', { exact: true })).toHaveCount(0);

  await releaseHeldProgressPhoto(page);
  await waitForAccountOutboxIdle(reauthenticatedPage, accountA);
  const after = await readDurableSnapshot(reauthenticatedPage);
  expect(after.activeSession?.accountId).toBe(accountA.id);
  expect(after.activeSession?.serverSessionId).toBe(reauthenticated.sid);
  expect(rawValue(after, profileKey(accountA.id))).toBe(profileBefore);
  expect(valuesFor(after, accountA)).toEqual(valuesBefore);
  expect(operationsFor(after, accountA)).toEqual(operationsBefore);
  expect(fixtureA.counts.profileWrites).toEqual(profileWritesBeforeRelease);
  expect(fixtureA.counts.stateWrites).toEqual(stateWritesBeforeRelease);
  await expect(page.getByAltText('Последнее фото прогресса')).toHaveCount(0);
  await expect(reauthenticatedPage.getByAltText('Последнее фото прогресса')).toHaveCount(0);
  expect(errorsA).toEqual([]);
  expect(errorsReauthenticated).toEqual([]);
  expect(fixtureReauthenticated.counts.profileWrites).toEqual([]);
  expect(fixtureReauthenticated.counts.stateWrites).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
});

test('an adaptation notice from account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');

  const accountANotice = 'Тестовая интерпретация недели для аккаунта A.';
  await page.getByRole('button', { name: 'Объяснить', exact: true }).click();
  await expect.poll(() => fixtureA.counts.aiRequests).toContainEqual({
    feature: 'plateau', account: accountA.id, session: accountA.sid,
  });
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('plateau');
  await expect(page.getByText(accountANotice, { exact: true }).first()).toBeVisible();

  const switched = await openAccountB(context, state, true, '/#dashboard');
  await waitForAccountSwitch(page);
  await expect(page.getByText(accountANotice, { exact: true })).toHaveCount(0);
  await expect(switched.page.getByText(accountANotice, { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('adaptation-notice-hidden-after-account-switch.png') });
});

test('an open mobile navigation menu from account A is hidden after another tab activates account B', async ({ page, context }, info) => {
  test.skip(!info.project.name.startsWith('iphone-') && !info.project.name.startsWith('android-'), 'Mobile navigation account-switch acceptance runs in phone browser profiles.');
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await expect(page.getByText('Ещё разделы', { exact: true })).toBeVisible();

  const switched = await openAccountB(context, state, true, '/#dashboard');
  await waitForAccountSwitch(page);
  await expect(page.getByText('Ещё разделы', { exact: true })).toHaveCount(0);
  await expect(switched.page.getByText('Ещё разделы', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(switched.errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  await switched.page.screenshot({ path: info.outputPath('mobile-more-menu-hidden-after-account-switch.png') });
});

test('bulk move and delete write once and cannot cross account diary keys', async ({ page, context }) => {
  const sharedEntryIdA = 'shared-food-entry-a';
  const sharedEntryIdB = 'shared-food-entry-b';
  const timestamp = new Date();
  timestamp.setHours(12, 0, 0, 0);
  const entry = (id: string, name: string, mealType: 'breakfast' | 'lunch') => ({
    id, name, calories: 320, protein: 24, fat: 12, carbs: 31,
    timestamp: timestamp.toISOString(), mealType,
  });
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    stateValues: [
      { accountId: accountA.id, key: diaryKey(accountA.id), value: JSON.stringify([
        entry(sharedEntryIdA, 'Блюдо A1', 'lunch'),
        entry(sharedEntryIdB, 'Блюдо A2', 'lunch'),
      ]), exists: true, version: 1 },
      { accountId: accountB.id, key: diaryKey(accountB.id), value: JSON.stringify([
        entry(sharedEntryIdA, 'Блюдо B1', 'lunch'),
        entry(sharedEntryIdB, 'Блюдо B2', 'lunch'),
      ]), exists: true, version: 1 },
    ],
  };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errorsA.push(message.text()); });
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page.getByText('Блюдо A1', { exact: true })).toBeVisible();
  await expect(page.getByText('Блюдо A2', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
  const keyA = diaryKey(accountA.id);
  await waitForOutboxKeyIdle(page, accountA, keyA);

  const writesBefore = fixtureA.counts.stateWrites.filter(key => key === keyA).length;
  const checkboxesA = page.locator('input[type="checkbox"][title="Выбрать"]');
  await checkboxesA.nth(0).check();
  await checkboxesA.nth(1).check();
  await expect(checkboxesA.nth(0)).toBeChecked();
  await expect(checkboxesA.nth(1)).toBeChecked();
  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    (window as Window & { failDiaryWrite?: boolean }).failDiaryWrite = true;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if ((window as Window & { failDiaryWrite?: boolean }).failDiaryWrite
        && this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected diary quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, keyA);
  const moveToBreakfast = page.getByRole('button', { name: '→ Завтрак', exact: true }).first();
  await moveToBreakfast.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось перенести записи.' })).toBeVisible();
  await expect(checkboxesA.nth(0)).toBeChecked();
  await expect(checkboxesA.nth(1)).toBeChecked();
  const failedMove = await readDurableSnapshot(page);
  expect(JSON.parse(rawValue(failedMove, keyA) ?? '[]').map((item: { mealType: string }) => item.mealType))
    .toEqual(['lunch', 'lunch']);
  expect(failedMove.operations.filter(operation => operation.key === keyA)).toEqual([]);
  expect(fixtureA.counts.stateWrites.filter(key => key === keyA).length).toBe(writesBefore);

  await page.evaluate(() => { (window as Window & { failDiaryWrite?: boolean }).failDiaryWrite = false; });
  await moveToBreakfast.click();
  await expect.poll(async () => {
    const value = rawValue(await readDurableSnapshot(page), keyA);
    return value ? JSON.parse(value).map((item: { mealType: string }) => item.mealType) : null;
  }).toEqual(['breakfast', 'breakfast']);
  await expect(checkboxesA.nth(0)).not.toBeChecked();
  await expect(checkboxesA.nth(1)).not.toBeChecked();
  await waitForOutboxKeyIdle(page, accountA, keyA);
  expect(fixtureA.counts.stateWrites.filter(key => key === keyA).length).toBe(writesBefore + 1);

  const writesBeforeDelete = fixtureA.counts.stateWrites.filter(key => key === keyA).length;
  await checkboxesA.nth(0).check();
  await checkboxesA.nth(1).check();
  await page.getByRole('button', { name: 'Удалить выбранные' }).first().click();
  await expect(page.getByText('Блюдо A1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Блюдо A2', { exact: true })).toHaveCount(0);
  await expect.poll(async () => {
    const value = rawValue(await readDurableSnapshot(page), keyA);
    return value ? JSON.parse(value) : null;
  }).toEqual([]);
  await waitForOutboxKeyIdle(page, accountA, keyA);
  expect(fixtureA.counts.stateWrites.filter(key => key === keyA).length).toBe(writesBeforeDelete + 1);

  const switched = await openAccountB(context, state, false, '/#nutrition');
  await waitForAccountSwitch(page);
  await expect(switched.page.getByText('Блюдо B1', { exact: true })).toBeVisible();
  await expect(switched.page.getByText('Блюдо B2', { exact: true })).toBeVisible();
  const selectedB = switched.page.locator('input[type="checkbox"][title="Выбрать"]').first();
  await expect(selectedB).not.toBeChecked();

  const final = await readDurableSnapshot(switched.page);
  expect(JSON.parse(rawValue(final, diaryKey(accountA.id)) ?? 'null')).toEqual([]);
  expect(JSON.parse(rawValue(final, diaryKey(accountB.id)) ?? '[]')).toEqual([
    entry(sharedEntryIdA, 'Блюдо B1', 'lunch'),
    entry(sharedEntryIdB, 'Блюдо B2', 'lunch'),
  ]);
  expect(operationsFor(final, accountA)).toEqual([]);
  expect(operationsFor(final, accountB)).toEqual([]);
  expect(errorsA).toEqual([]);
  expect(switched.errors).toEqual([]);
});

test('manual diary add waits for durable commit and keeps the search result available on failure', async ({ page }) => {
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    stateValues: [{
      accountId: accountA.id,
      key: historyKey(accountA.id),
      value: JSON.stringify([{
        id: 'history-only-item', name: 'Тестовый перекус', calories: 240, protein: 12, fat: 8, carbs: 28,
        timestamp: '2026-10-17T12:00:00.000Z', mealType: 'lunch',
      }]),
      exists: true,
      version: 1,
    }],
  };
  await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  const search = page.getByPlaceholder('Поиск блюда в истории...');
  await search.fill('Тестовый перекус');
  const result = page.getByText('Тестовый перекус', { exact: true });
  await expect(result).toBeVisible();
  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    (window as Window & { failDiaryWrite?: boolean }).failDiaryWrite = true;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if ((window as Window & { failDiaryWrite?: boolean }).failDiaryWrite
        && this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected diary quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, diaryKey(accountA.id));

  await result.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить запись в дневнике.' })).toBeVisible();
  await expect(search).toHaveValue('Тестовый перекус');
  await expect(result).toBeVisible();
  const failed = await readDurableSnapshot(page);
  expect(rawValue(failed, diaryKey(accountA.id))).toBeNull();
  expect(failed.operations.filter(operation => operation.key === diaryKey(accountA.id))).toEqual([]);

  await page.evaluate(() => { (window as Window & { failDiaryWrite?: boolean }).failDiaryWrite = false; });
  await result.click();
  await expect(search).toHaveValue('');
  await expect(page.getByText('Тестовый перекус', { exact: true }).last()).toBeVisible();
  await expect.poll(async () => {
    const snapshot = await readDurableSnapshot(page);
    return JSON.parse(rawValue(snapshot, diaryKey(accountA.id)) ?? '[]')
      .map((item: { name: string }) => item.name);
  }).toContain('Тестовый перекус');
  await waitForOutboxKeyIdle(page, accountA, diaryKey(accountA.id));
});

test('food diary edit keeps its draft when the durable commit fails and can be retried', async ({ page }) => {
  const original = {
    id: 'editable-food-entry', name: 'Исходное блюдо', calories: 300, protein: 20, fat: 10, carbs: 32,
    timestamp: '2026-10-17T12:00:00.000Z', mealType: 'lunch',
  };
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    stateValues: [{
      accountId: accountA.id, key: diaryKey(accountA.id), value: JSON.stringify([original]), exists: true, version: 1,
    }],
  };
  await installAccountApi(page, state);
  await openApp(page, '/#nutrition');
  await expect(page.getByText('Исходное блюдо', { exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);
  const edit = page.getByRole('button', { name: 'Правка', exact: true });
  if (!await edit.isVisible()) await page.getByRole('button', { name: 'Действия', exact: true }).click();
  await edit.click();
  const name = page.getByPlaceholder('Например: манты свинина/говядина с манго-чили соусом');
  await name.fill('Исправленное блюдо');

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    (window as Window & { failDiaryWrite?: boolean }).failDiaryWrite = true;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if ((window as Window & { failDiaryWrite?: boolean }).failDiaryWrite
        && this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected diary quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, diaryKey(accountA.id));

  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить изменения.' })).toBeVisible();
  await expect(name).toHaveValue('Исправленное блюдо');
  const failed = await readDurableSnapshot(page);
  expect(JSON.parse(rawValue(failed, diaryKey(accountA.id)) ?? '[]')).toEqual([original]);
  expect(failed.operations.filter(operation => operation.key === diaryKey(accountA.id))).toEqual([]);

  await page.evaluate(() => { (window as Window & { failDiaryWrite?: boolean }).failDiaryWrite = false; });
  await save.click();
  await expect(name).toHaveCount(0);
  await expect(page.getByText('Исправленное блюдо', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const snapshot = await readDurableSnapshot(page);
    return JSON.parse(rawValue(snapshot, diaryKey(accountA.id)) ?? '[]')
      .map((item: { name: string }) => item.name);
  }).toEqual(['Исправленное блюдо']);
});

test('food photo analysis persists the diary entry, history and usage for its active account', async ({ page }, info) => {
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

test('a favorite recipe draft stays open when its durable commit fails and can be retried', async ({ page }) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  await installAccountApi(page, state);
  await openApp(page, '/#recipes');
  await expect(page).toHaveTitle(/FitFocus/);
  await waitForAccountOutboxIdle(page, accountA);

  const recipeUpload = page.locator('input[type="file"][accept="image/*"]').nth(1);
  await recipeUpload.setInputFiles({
    name: 'recipe.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pL8AAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByText('Новое блюдо', { exact: true })).toBeVisible();

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    (window as Window & { failFavoriteRecipeWrite?: boolean }).failFavoriteRecipeWrite = true;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if ((window as Window & { failFavoriteRecipeWrite?: boolean }).failFavoriteRecipeWrite
        && this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected favorite recipe quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, favoriteRecipesKey(accountA.id));

  const save = page.getByRole('button', { name: 'Сохранить', exact: true });
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить рецепт.' })).toBeVisible();
  await expect(page.getByText('Новое блюдо', { exact: true })).toBeVisible();
  const failed = await readDurableSnapshot(page);
  expect(rawValue(failed, favoriteRecipesKey(accountA.id))).toBeNull();
  expect(failed.operations.filter(operation => operation.key === favoriteRecipesKey(accountA.id))).toEqual([]);

  await page.evaluate(() => { (window as Window & { failFavoriteRecipeWrite?: boolean }).failFavoriteRecipeWrite = false; });
  await save.click();
  await expect(page.getByText('Новое блюдо', { exact: true })).toHaveCount(0);
  await expect.poll(async () => {
    const snapshot = await readDurableSnapshot(page);
    return JSON.parse(rawValue(snapshot, favoriteRecipesKey(accountA.id)) ?? '[]')
      .map((recipe: { title: string }) => recipe.title);
  }).toContain('Тестовый рецепт');
  await waitForAccountOutboxIdle(page, accountA);
  await expect(page.getByText('Тестовый рецепт', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить рецепт.' })).toHaveCount(0);
});

test('a held step-by-step recipe response cannot update the diary or usage after another tab signs in as account B', async ({ page, context }, info) => {
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

test('a held step-by-step recipe response cannot update after the same account starts a new server session', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [], errorsReauthenticated: string[] = [];
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
  await waitForAccountOutboxIdle(page, accountA);

  const beforeReauthentication = await readDurableSnapshot(page);
  const diaryBefore = rawValue(beforeReauthentication, diaryKey(accountA.id));
  const profileBefore = rawValue(beforeReauthentication, profileKey(accountA.id));
  const valuesBefore = valuesFor(beforeReauthentication, accountA);
  const operationsBefore = operationsFor(beforeReauthentication, accountA);
  const diaryKeys = [diaryKey(accountA.id), historyKey(accountA.id)];
  const diaryAndHistoryWritesBefore = fixtureA.counts.stateWrites.filter(key => diaryKeys.includes(key));
  const profileWritesBefore = [...fixtureA.counts.profileWrites];
  const achievementChecksBefore = fixtureA.counts.achievementChecks;
  expect(beforeReauthentication.activeSession?.serverSessionId).toBe(accountA.sid);

  const reauthenticated = { id: accountA.id, sid: 'e'.repeat(64) };
  state.current = reauthenticated;
  const reauthenticatedPage = await context.newPage();
  reauthenticatedPage.on('pageerror', error => errorsReauthenticated.push(error.message));
  reauthenticatedPage.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsReauthenticated.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureReauthenticated = await installAccountApi(reauthenticatedPage, state);

  try {
    await openApp(reauthenticatedPage, '/#nutrition');
    await expect(reauthenticatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reauthenticatedPage)).activeSession?.serverSessionId)
      .toBe(reauthenticated.sid);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await waitForAccountOutboxIdle(reauthenticatedPage, accountA);

    const beforeOldResponse = await readDurableSnapshot(reauthenticatedPage);
    const newSessionDiary = rawValue(beforeOldResponse, diaryKey(accountA.id));
    const newSessionProfile = rawValue(beforeOldResponse, profileKey(accountA.id));
    const newSessionValues = valuesFor(beforeOldResponse, accountA);
    const newSessionOperations = operationsFor(beforeOldResponse, accountA);
    expect(beforeReauthentication.activeSession?.sessionEpoch).not.toBe(beforeOldResponse.activeSession?.sessionEpoch);
    expect(newSessionDiary).toBe(diaryBefore);
    expect(newSessionProfile).toBe(profileBefore);
    expect(newSessionValues).toEqual(valuesBefore);
    expect(newSessionOperations).toEqual(operationsBefore);
    const recipeUsageBefore = await reauthenticatedPage.evaluate(key => localStorage.getItem(key), recipeUsageKey(accountA.id));
    expect(Date.now() - fixtureA.counts.heldStartedAtMs).toBeLessThan(MAX_HELD_AI_RESPONSE_MS);

    fixtureA.release();
    await expect.poll(() => fixtureA.counts.releasedResponses).toBe(1);

    const afterOldResponse = await readDurableSnapshot(reauthenticatedPage);
    expect(rawValue(afterOldResponse, diaryKey(accountA.id))).toBe(newSessionDiary);
    expect(rawValue(afterOldResponse, profileKey(accountA.id))).toBe(newSessionProfile);
    expect(valuesFor(afterOldResponse, accountA)).toEqual(newSessionValues);
    expect(operationsFor(afterOldResponse, accountA)).toEqual(newSessionOperations);
    expect(fixtureA.counts.profileWrites).toEqual(profileWritesBefore);
    expect(fixtureA.counts.stateWrites.filter(key => diaryKeys.includes(key)))
      .toEqual(diaryAndHistoryWritesBefore);
    expect(fixtureA.counts.achievementChecks).toBe(achievementChecksBefore);
    expect(await reauthenticatedPage.evaluate(key => localStorage.getItem(key), recipeUsageKey(accountA.id)))
      .toBe(recipeUsageBefore);
    expect(fixtureA.counts.aiRequests.filter(request => request.feature === 'recipe')).toEqual([{
      feature: 'recipe', account: accountA.id, session: accountA.sid,
    }]);
    await expect(page.getByText('Поздний пошаговый рецепт A', { exact: true })).toHaveCount(0);
    await expect(reauthenticatedPage.getByText('Поздний пошаговый рецепт A', { exact: true })).toHaveCount(0);
    expect(errorsA).toEqual([]);
    expect(errorsReauthenticated).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(reauthenticatedPage.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    fixtureA.release();
    fixtureReauthenticated.release();
  }
});

test('step-by-step recipe generation and favorite saving commit to the active session', async ({ page }, info) => {
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
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await waitForAccountOutboxIdle(page, accountA);

  await page.evaluate(key => {
    const add = IDBObjectStore.prototype.add;
    (window as Window & { failFavoriteRecipeWrite?: boolean }).failFavoriteRecipeWrite = true;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const operation = args[0] as { key?: string };
      if ((window as Window & { failFavoriteRecipeWrite?: boolean }).failFavoriteRecipeWrite
        && this.name === 'outbox' && operation?.key === key) {
        throw new DOMException('Injected favorite recipe quota failure', 'QuotaExceededError');
      }
      return add.apply(this, args);
    };
  }, favoriteRecipesKey(accountA.id));

  await page.getByRole('button', { name: 'Сохранить рецепт', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить рецепт.' })).toBeVisible();
  const failedFavoriteSave = await readDurableSnapshot(page);
  expect(rawValue(failedFavoriteSave, favoriteRecipesKey(accountA.id))).toBeNull();
  expect(failedFavoriteSave.operations.filter(operation => operation.key === favoriteRecipesKey(accountA.id))).toEqual([]);

  await page.evaluate(() => { (window as Window & { failFavoriteRecipeWrite?: boolean }).failFavoriteRecipeWrite = false; });
  await page.getByRole('button', { name: 'Сохранить рецепт', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Рецепт сохранён в избранное.' })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);

  const snapshot = await readDurableSnapshot(page);
  const diary = JSON.parse(rawValue(snapshot, diaryKey(accountA.id)) ?? '[]') as Array<{ name: string; insight?: { recipe?: { title?: string } } }>;
  const favoriteRecipes = JSON.parse(rawValue(snapshot, favoriteRecipesKey(accountA.id)) ?? '[]') as Array<{ title: string }>;
  expect(fixture.counts.aiRequests.filter(item => item.feature === 'recipe')).toEqual([
    { feature: 'recipe', account: accountA.id, session: accountA.sid },
  ]);
  expect(diary).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Тестовый омлет', insight: expect.objectContaining({ recipe: expect.objectContaining({ title: 'Пошаговый тестовый рецепт' }) }) }),
  ]));
  expect(favoriteRecipes).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Пошаговый тестовый рецепт' })]));
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

test('WIS share completion from a retired session cannot restore its notice after account reactivation', async ({ page, context }) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await waitForAccountOutboxIdle(page, accountA);
  await expect(page.getByRole('button', { name: 'Поделиться', exact: true })).toBeVisible();

  await page.evaluate(() => {
    const testWindow = window as Window & {
      __ffShareStarted?: boolean;
      __ffShareFinished?: boolean;
      __ffReleaseShare?: () => void;
    };
    const card = document.querySelector('[aria-hidden="true"].fixed') as HTMLDivElement | null;
    if (card) {
      card.style.width = '1px';
      card.style.height = '1px';
      card.style.left = '0';
      card.style.boxShadow = 'none';
      card.replaceChildren(document.createElement('div'));
    }
    const fonts = document.fonts as FontFaceSet & { ready: Promise<FontFace[]> };
    Object.defineProperty(fonts, 'ready', { configurable: true, value: Promise.resolve([]) });
    testWindow.__ffShareStarted = false;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => new Promise<void>(resolve => {
        testWindow.__ffShareStarted = true;
        testWindow.__ffReleaseShare = () => {
          testWindow.__ffShareFinished = true;
          resolve();
        };
      }),
    });
  });
  await page.getByRole('button', { name: 'Поделиться', exact: true }).click();
  await expect(page.getByText('Готовим PNG-карточку WIS...', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __ffShareStarted?: boolean }).__ffShareStarted)).toBe(true);

  try {
    const switched = await openAccountB(context, state);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await waitForAccountSwitch(page);

    state.current = accountA;
    state.profile = profileFor(accountA.id);
    const reactivatedPage = await context.newPage();
    const reactivatedErrors: string[] = [];
    reactivatedPage.on('pageerror', error => reactivatedErrors.push(error.message));
    reactivatedPage.on('console', message => {
      if (['error', 'warning'].includes(message.type())) reactivatedErrors.push(`${message.type()}: ${message.text()}`);
    });
    const reactivated = await installAccountApi(reactivatedPage, state);
    await openApp(reactivatedPage, '/#dashboard');
    await expect(reactivatedPage).toHaveTitle(/FitFocus/);
    await expect.poll(async () => (await readDurableSnapshot(reactivatedPage)).activeSession?.accountId).toBe(accountA.id);
    await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
    await waitForAccountOutboxIdle(reactivatedPage, accountA);

    await page.evaluate(async () => {
      const testWindow = window as Window & { __ffReleaseShare?: () => void };
      testWindow.__ffReleaseShare?.();
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    });
    await expect.poll(() => page.evaluate(() => (window as Window & { __ffShareFinished?: boolean }).__ffShareFinished)).toBe(true);
    await page.waitForTimeout(100);

    await expect(page.getByText('Карточка готова и передана в системное меню отправки.', { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await readDurableSnapshot(page)).activeSession?.accountId).toBe(accountA.id);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    expect(reactivatedErrors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    await page.evaluate(() => (window as Window & { __ffReleaseShare?: () => void }).__ffReleaseShare?.());
  }
});

test('health report PDF is not downloaded when the account changes during font loading', async ({ page, context }) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });

  const fontRequestStarted = deferred();
  const releaseFontRequest = deferred();
  await page.route('**/*NotoSans-Regular*', async route => {
    fontRequestStarted.release();
    await releaseFontRequest.promise;
    await route.continue();
  });

  const fixtureA = await installAccountApi(page, state);
  await openApp(page, '/#dashboard');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect.poll(() => fixtureA.counts.completedAiFeatures).toContain('wis_text');
  await expect(page.getByRole('button', { name: 'Краткий PDF', exact: true })).toBeVisible();
  await waitForAccountOutboxIdle(page, accountA);

  try {
    await page.getByRole('button', { name: 'Краткий PDF', exact: true }).click();
    await fontRequestStarted.promise;

    const switched = await openAccountB(context, state);
    await waitForAccountSwitch(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    releaseFontRequest.release();

    expect(await downloadPromise).toBe(false);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    releaseFontRequest.release();
  }
});

test('a late profile save from account A cannot acknowledge or overwrite after account B signs in', async ({ page, context }, info) => {
  let started!: () => void;
  const writeStarted = new Promise<void>(resolve => { started = resolve; });
  const releaseWrite = deferred();
  const releaseRecoveredWrite = deferred();
  const state: FixtureState = {
    current: accountA,
    profile: profileFor(accountA.id),
    holdProfileWrite: { active: true, started, wait: releaseWrite.promise },
  };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  const fixtureA = await installAccountApi(page, state);
  try {
    await openApp(page, '/#settings');
    const profileNameA = page.getByPlaceholder('Как к вам обращаться');
    await expect(page).toHaveTitle(/FitFocus/);
    await expect(profileNameA).toHaveValue('Профиль A');
    await waitForAccountOutboxIdle(page, accountA);
    const beforeWrite = await readDurableSnapshot(page);
    const profileBefore = rawValue(beforeWrite, profileKey(accountA.id));

    await profileNameA.fill('Локальное имя аккаунта A');
    const lateSaveResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
    await writeStarted;
    expect(fixtureA.counts.profileWrites).toEqual([accountA.id]);

    const sendingSnapshot = await readDurableSnapshot(page);
    const operation = operationsFor(sendingSnapshot, accountA).find(entry => entry.key === profileKey(accountA.id));
    expect(operation).toMatchObject({ status: 'sending', value: expect.stringContaining('Локальное имя аккаунта A') });
    expect(operation).toBeTruthy();

    const switched = await openAccountB(context, state, true, '/#settings');
    await waitForAccountSwitch(page);
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();
    await expect(switched.page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Профиль B');
    releaseWrite.release();

    const response = await lateSaveResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()['x-fitfocus-state-account']).toBe(accountA.id);
    expect(response.headers()['x-fitfocus-state-session']).toBe(accountA.sid);
    expect((await response.json()).profile.name).toBe('Локальное имя аккаунта A');

    const afterResponse = await readDurableSnapshot(switched.page);
    expect(afterResponse.activeSession?.accountId).toBe(accountB.id);
    expect(rawValue(afterResponse, profileKey(accountA.id))).not.toBe(profileBefore);
    expect(JSON.parse(rawValue(afterResponse, profileKey(accountA.id))!).name).toBe('Локальное имя аккаунта A');
    expect(operationsFor(afterResponse, accountA)).toEqual(expect.arrayContaining([
      expect.objectContaining({ opId: operation!.opId, key: profileKey(accountA.id), value: operation!.value, status: 'sending' }),
    ]));
    expect(JSON.parse(rawValue(afterResponse, profileKey(accountB.id))!).name).toBe('Профиль B');
    expect(operationsFor(afterResponse, accountB)).toEqual([]);
    expect(switched.fixture.counts.profileWrites).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
    await switched.page.screenshot({ path: info.outputPath('late-profile-save-account-b.png') });

    await Promise.all([switched.page.goto('about:blank'), page.goto('about:blank')]);
    const accountAReauthenticated: Account = { id: accountA.id, sid: 'c'.repeat(64) };
    state.current = accountAReauthenticated;
    state.profile = profileFor(accountA.id);
    let recoveredWriteStarted!: () => void;
    const recoveredWriteBegan = new Promise<void>(resolve => { recoveredWriteStarted = resolve; });
    state.holdProfileWrite = { active: true, started: recoveredWriteStarted, wait: releaseRecoveredWrite.promise };
    const resumedPage = await context.newPage();
    const resumedErrors: string[] = [];
    resumedPage.on('pageerror', error => resumedErrors.push(error.message));
    resumedPage.on('console', message => {
      if (['error', 'warning'].includes(message.type())) resumedErrors.push(`${message.type()}: ${message.text()}`);
    });
    const resumedFixture = await installAccountApi(resumedPage, state);
    const recoveredSave = resumedPage.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'PUT');
    await openApp(resumedPage, '/#settings');
    await expect(resumedPage.getByPlaceholder('Как к вам обращаться')).toHaveValue('Локальное имя аккаунта A');
    await recoveredWriteBegan;

    const retrySnapshot = await readDurableSnapshot(resumedPage);
    const recoveredOperation = operationsFor(retrySnapshot, accountA)
      .find(entry => entry.key === profileKey(accountA.id));
    expect(recoveredOperation).toMatchObject({ opId: operation!.opId, status: 'sending', value: operation!.value });
    expect(recoveredOperation?.attempt?.sessionEpoch).not.toBe(operation!.attempt?.sessionEpoch);
    expect(retrySnapshot.activeSession?.serverSessionId).toBe(accountAReauthenticated.sid);
    releaseRecoveredWrite.release();

    const recoveredResponse = await recoveredSave;
    expect(recoveredResponse.status()).toBe(200);
    expect(recoveredResponse.headers()['x-fitfocus-state-account']).toBe(accountA.id);
    expect(recoveredResponse.headers()['x-fitfocus-state-session']).toBe(accountAReauthenticated.sid);
    await expect.poll(() => resumedFixture.counts.profileWrites).toEqual([accountA.id]);
    await expect.poll(async () => operationsFor(await readDurableSnapshot(resumedPage), accountA)
      .filter(entry => entry.key === profileKey(accountA.id))).toEqual([]);

    const afterRecovery = await readDurableSnapshot(resumedPage);
    expect(afterRecovery.activeSession?.accountId).toBe(accountA.id);
    expect(afterRecovery.activeSession?.serverSessionId).toBe(accountAReauthenticated.sid);
    expect(JSON.parse(rawValue(afterRecovery, profileKey(accountA.id))!).name).toBe('Локальное имя аккаунта A');
    expect(resumedErrors).toEqual([]);
    await expect(resumedPage.locator('vite-error-overlay')).toHaveCount(0);
    await resumedPage.screenshot({ path: info.outputPath('late-profile-save-account-a-recovered.png') });
  } finally {
    releaseWrite.release();
    releaseRecoveredWrite.release();
  }
});

test('a late profile refresh from account A cannot hydrate after account B signs in', async ({ page, context }, info) => {
  const state: FixtureState = { current: accountA, profile: profileFor(accountA.id) };
  const errorsA: string[] = [];
  page.on('pageerror', error => errorsA.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) errorsA.push(`${message.type()}: ${message.text()}`);
  });
  await installAccountApi(page, state);
  await openApp(page, '/#settings');
  const profileNameA = page.getByPlaceholder('Как к вам обращаться');
  await expect(page).toHaveTitle(/FitFocus/);
  await expect(profileNameA).toHaveValue('Профиль A');
  await waitForAccountOutboxIdle(page, accountA);
  const beforeSwitch = await readDurableSnapshot(page);
  const profileABefore = rawValue(beforeSwitch, profileKey(accountA.id));

  let started!: () => void;
  const refreshStarted = new Promise<void>(resolve => { started = resolve; });
  const releaseRefresh = deferred();
  state.holdProfileRead = {
    active: true,
    started,
    wait: releaseRefresh.promise,
    profile: { ...state.profile },
  };

  try {
    await page.getByRole('button', { name: /Перезагрузить из облака/ }).click();
    await refreshStarted;

    const switched = await openAccountB(context, state, true, '/#settings');
    await waitForAccountSwitch(page);
    await expect(switched.page.getByPlaceholder('Как к вам обращаться')).toHaveValue('Профиль B');
    await expect(page.getByText('Сессия изменилась в другой вкладке. Обновите страницу, чтобы продолжить.')).toBeVisible();

    const lateProfileResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/profile' && response.request().method() === 'GET');
    releaseRefresh.release();
    const response = await lateProfileResponse;
    expect(response.status()).toBe(200);
    expect((await response.json()).profile.name).toBe('Профиль A');
    await expect.poll(async () => rawValue(await readDurableSnapshot(page), profileKey(accountA.id))).toBe(profileABefore);
    const afterResponse = await readDurableSnapshot(switched.page);
    expect(rawValue(afterResponse, profileKey(accountB.id))).not.toBeNull();
    expect(JSON.parse(rawValue(afterResponse, profileKey(accountB.id))!).name).toBe('Профиль B');
    expect(operationsFor(afterResponse, accountB)).toEqual([]);
    expect(errorsA).toEqual([]);
    expect(switched.errors).toEqual([]);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(switched.page.locator('vite-error-overlay')).toHaveCount(0);
  } finally {
    releaseRefresh.release();
  }
});

test('pending account A outbox resumes after reload with the same operation and a fresh session', async ({ page }, info) => {
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

test('late Huawei sync after another tab signs in as account B cannot commit account A profile', async ({ page, context }) => {
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
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  const beforeB = await readDurableSnapshot(switched.page);
  const profileBBefore = rawValue(beforeB, profileKey(accountB.id));

  fixtureA.releaseHuawei();
  await expect.poll(() => fixtureA.counts.huaweiSyncResponses).toBe(1);
  await expect(page.getByRole('status')).toContainText('Сессия изменилась в другой вкладке');
  await expect(page.getByText('Huawei Health синхронизирован: обновлено полей 1.', { exact: true })).toHaveCount(0);

  const afterA = await readDurableSnapshot(page);
  expect(fixtureA.counts.huaweiSyncRequests).toEqual([{ account: accountA.id, session: accountA.sid }]);
  expect(rawValue(afterA, profileKey(accountA.id))).toBe(profileBefore);
  expect(afterA.operations.filter(operation => operation.key === profileKey(accountA.id))).toEqual(profileOperationsBefore);
  const afterB = await readDurableSnapshot(switched.page);
  expect(rawValue(afterB, profileKey(accountB.id))).toBe(profileBBefore);
});

test('late Huawei sync is rejected after the same account signs in with a new server session', async ({ page, context }) => {
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
