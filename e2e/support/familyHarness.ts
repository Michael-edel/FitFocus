import { expect, type Page } from '@playwright/test';
import { mockApp, openApp, buildMockProfile } from './appHarness';
import { planningDay, planningRoster, confirmedConfiguration } from './familyPlanningFixture';
import { navigate } from './navigation';
import type { CloudFamilyMember } from '../../features/family/familyApi';

const account = 'google-e2e-sub', sid = 'a'.repeat(64), familyId = 'family-durable-e2e';
const headers = { 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  ...Object.fromEntries(['State', 'Profile', 'Bootstrap', 'AI', 'Weekly-Menu', 'Achievements', 'Huawei', 'Push', 'Family', 'Family-Menu'].flatMap(resource =>
    [[`X-FitFocus-${resource}-Protocol`, resource === 'State' ? '2' : '1'], [`X-FitFocus-${resource}-Guard`, '1']])) };

export async function saved(page: Page) {
  return page.evaluate(async account => {
    const report = (event: string, detail: Record<string, unknown> = {}) => {
      if ((window as Window & { __fitfocusE2eIdbDiagnostics?: boolean }).__fitfocusE2eIdbDiagnostics) {
        console.log('[FITFOCUS-SAVED]', JSON.stringify({ event, ...detail }));
      }
    };
    // The native PWA test reuses its app connection so probes do not enqueue extra opens behind old clients.
    let db = (window as Window & { __fitfocusE2eDatabase?: IDBDatabase }).__fitfocusE2eDatabase;
    let closeDatabase = false;
    if (db) {
      report('connection-reused', { version: db.version });
    } else {
      const request = indexedDB.open('fitfocus-user-state-v1');
      report('open-requested');
      request.addEventListener('blocked', () => report('open-blocked'));
      request.addEventListener('error', () => report('open-error', { error: request.error?.name ?? null }));
      db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      closeDatabase = true;
      report('open-success', { version: db.version });
    }
    try {
      const tx = db.transaction(['values', 'outbox'], 'readonly');
      report('transaction-created');
      const transactionComplete = new Promise<void>((resolve, reject) => {
        tx.addEventListener('complete', () => { report('transaction-complete'); resolve(); }, { once: true });
        tx.addEventListener('abort', () => {
          report('transaction-abort', { error: tx.error?.name ?? null });
          reject(tx.error ?? new DOMException('IndexedDB read transaction aborted', 'AbortError'));
        }, { once: true });
      });
      const get = <T,>(read: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        read.onsuccess = () => { report('read-success', { store: (read.source as IDBObjectStore | null)?.name ?? null }); resolve(read.result); };
        read.onerror = () => { report('read-error', { error: read.error?.name ?? null }); reject(read.error); };
      });
      const [values, operations] = await Promise.all([get(tx.objectStore('values').getAll()), get(tx.objectStore('outbox').getAll())]);
      await transactionComplete;
      report('read-complete', { values: values.length, operations: operations.length });
      return { version: db.version, menus: values.filter(value => value.key.includes('_family_menu:')).map(value => JSON.parse(value.value)),
        profiles: values.filter(value => value.key === `fitfocus_data_${account}_profile`).map(value => JSON.parse(value.value)),
        operations: operations.filter(op => op.resource === 'familyMenu').map(op => ({ opId: op.opId, status: op.status, retryCount: op.retryCount, value: op.value, serverSnapshot: op.serverSnapshot })) };
    } finally { if (closeDatabase) db.close(); }
  }, account);
}

export async function setup(page: Page, mode: 'normal' | 'offline' | 'conflict' | 'held-ai' | 'held-preview' | 'session-expired-ai' | 'quota' = 'normal', options: { url?: string; durable?: boolean; realServiceWorker?: boolean; standalone?: boolean; familyMembers?: CloudFamilyMember[] } = {}) {
  await mockApp(page, { session: 'app', realServiceWorker: options.realServiceWorker, push: { standalone: options.standalone ?? false } });
  let active = true, available = mode !== 'offline', conflict = mode === 'conflict', version = 1, week = '';
  let cloud = planningDay(account, '2026-10-23', 0.75, undefined, options.familyMembers), profile = { ...buildMockProfile(), plan: 'family' as const };
  const roster = planningRoster(familyId, account, options.familyMembers);
  const errors: string[] = [], counts = { preview: 0, previewFulfilled: 0, put: 0, bases: [] as number[], accepted: 0, ai: 0, fulfilled: 0, oldWriter: 0, achievements: 0, stateReads: 0, logout: 0 };
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let releasePreview!: () => void; const heldPreview = new Promise<void>(resolve => { releasePreview = resolve; });
  let holdStateRead = false, stateReadHeld = false;
  let releaseHeldStateRead!: () => void; const heldStateRead = new Promise<void>(resolve => { releaseHeldStateRead = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    if (message.location().url.includes('/api/family/menu/state') && /\b(409|503)\b/.test(message.text()) && ['offline', 'conflict'].includes(mode)) return;
    errors.push(message.text());
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (path === '/api/me') return json(active ? { user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
      ...Object.fromEntries(['bootstrapSync', 'profileSync', 'aiSync', 'weeklyMenuSync', 'achievementSync', 'huaweiSync', 'pushSync', 'familySync'].map(name =>
        [name, { protocol: 1, guard: 1, ...(name === 'profileSync' ? { weeklyMenuProjection: 1 } : {}), ...(name === 'familySync' ? { target: 1 } : {}) }])),
      familyMenuSync: { protocol: 1, guard: 1, cas: 1 }, familyPlanning: { version: 1 } } : { user: null });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile') {
      if (request.method() === 'PUT') profile = { ...request.postDataJSON(), version: request.postDataJSON().baseVersion + 1 };
      return json({ profile, version: profile.version });
    }
    if (path === '/api/state') {
      if (request.method() !== 'GET') expect(request.postDataJSON().items.every((item: { key: string }) => !item.key.includes('_family_menu:'))).toBe(true);
      return json(request.method() === 'GET' ? { items: [] } : { ok: true, items: request.postDataJSON().items.map((item: { key: string; baseVersion: number }) => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/logout') { counts.logout += 1; active = false; return json({ ok: true }); }
    if (path === '/api/wearable/huawei/status') return json({ configured: false, connected: false });
    if (path === '/api/achievements' && request.method() === 'POST') { counts.achievements += 1; return json({ ok: true, unlocked: [] }); }
    if (path === '/api/family') return json({ family: { id: familyId, name: 'Семья с постоянным меню', owner_user_id: account },
      members: [{ user_id: account, role: 'owner', status: 'active' }, ...(options.familyMembers ?? [])] });
    if (path === '/api/family/dining-profiles') return json({ roster });
    if (path === '/api/family/dining-profile') return json({ profile: { ...roster.profiles[0], configuration: confirmedConfiguration } });
    if (path === '/api/family/menu') {
      if (request.method() !== 'GET') { counts.oldWriter += 1; return json({ error: 'OLD_WRITER' }, 409); }
      week = url.searchParams.get('week')!; cloud = { ...cloud, weekStart: week };
      return json({ weekStart: week, shared: { familyId, version, menu: cloud }, portions: null });
    }
    if (path === '/api/family/menu/state') {
      expect(request.headers()['x-fitfocus-state-account']).toBe(account); expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      if (request.method() === 'GET') {
        week = url.searchParams.get('week')!;
        cloud = { ...planningDay(account, week, 0.75, undefined, options.familyMembers), ...(cloud.weekStart === week ? cloud : {}) };
        counts.stateReads += 1;
        if (holdStateRead) { stateReadHeld = true; await heldStateRead; }
        return json({ ok: true, snapshot: { familyId, weekStart: week, version, menu: cloud } });
      }
      if (request.method() === 'PUT') {
        counts.put += 1; const body = request.postDataJSON();
        counts.bases.push(body.baseVersion);
        expect(body.familyId).toBe(familyId); expect(body.weekStart).toBe(week);
        if (!available) return json({ error: 'INJECTED_OFFLINE' }, 503);
        if (conflict) { version = 8; cloud = planningDay(account, week, 1, undefined, options.familyMembers); return json({ error: 'VERSION_CONFLICT', snapshot: { familyId, weekStart: week, version, menu: cloud } }, 409); }
        expect(body.baseVersion).toBe(version); cloud = body.menu; version += 1; counts.accepted += 1;
      }
      return json({ ok: true, snapshot: { familyId, weekStart: week, version, menu: cloud } });
    }
    if (path === '/api/family/menu/generate') {
      counts.preview += 1;
      const body = request.postDataJSON();
      expect(body).toMatchObject({ preview: true, familyId, date: week, rosterVersion: 1 });
      expect(request.headers()['x-fitfocus-state-session']).toBe(sid);
      // The former family AI path now has a server preview boundary; retain each held-response ownership probe.
      if (mode === 'held-ai' || mode === 'session-expired-ai') counts.ai += 1;
      if (mode === 'session-expired-ai') return json({ error: 'STATE_SESSION_CHANGED' }, 401);
      if (mode === 'held-ai') await held;
      if (mode === 'held-preview') await heldPreview;
      const menu = planningDay(account, week, 1, body.selections, options.familyMembers);
      await json({ preview: true, rosterVersion: 1, profileVersions: menu.planningV1.profileVersions,
        shared: { familyId, weekStart: week, menu } });
      counts.previewFulfilled += 1;
      if (mode === 'held-ai') counts.fulfilled += 1;
      return;
    }
    if (path === '/api/ai' && String(request.postDataJSON()?.feature).startsWith('family_menu')) { counts.oldWriter += 1; return json({ error: 'OLD_GENERATOR' }, 409); }
    if (path === '/api/weekly_menu/items' && request.method() === 'POST') { counts.oldWriter += 1; return json({ error: 'OLD_WRITER' }, 409); }
    if (path === '/api/shopping/list') return json({ family_id: familyId, week_start: week, items: cloud.shoppingListItems?.map(item => ({ ...item, checked: false })) });
    return route.fallback();
  });
  if (mode === 'quota') await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value: unknown, key?: IDBValidKey) {
      if (this.name === 'outbox' && typeof value === 'object' && value && 'resource' in value && value.resource === 'familyMenu') throw new DOMException('Injected family quota', 'QuotaExceededError');
      return key === undefined ? add.call(this, value) : add.call(this, value, key);
    };
  });
  await openApp(page, options.url ?? '/#family'); await expect(page).toHaveTitle(/FitFocus/); await expect(page).toHaveURL(/#family$/);
  // #root also renders the bootstrap shell; start the data assertion on the actual family screen.
  await expect(page.getByRole('heading', { name: 'Меню семьи', exact: true })).toBeVisible();
  await expect(page.getByText('Семья с постоянным меню', { exact: true })).toBeVisible();
  if (options.durable !== false) await expect.poll(async () => (await saved(page)).menus.length).toBe(1);
  // The IDB refresh precedes the hook's final published/editor update and run() completion.
  await expect(page.getByLabel('Дата меню', { exact: true })).toBeEnabled();
  return { errors, counts, restore: () => { available = true; }, resolveConflict: () => { conflict = false; }, release, releasePreview,
    holdStateRead: () => { holdStateRead = true; }, releaseStateRead: releaseHeldStateRead, stateReadHeld: () => stateReadHeld,
  };
}
export { navigate };

export function breakfastPortion(page: Page) {
  // The wrapping label also contains option text, so getByLabel(..., exact:true) is not its exact name.
  return page.locator('label.fp-share').filter({ has: page.getByText('Порция: E2E User, Завтрак', { exact: true }) }).getByRole('combobox');
}

export async function preview(page: Page) {
  await navigate(page, 'Меню семьи');
  await expect(page.getByLabel('Дата меню', { exact: true })).toBeEnabled();
  const selection = page.getByText('Кто ест и какие порции', { exact: true });
  const editor = page.locator('details').filter({ has: selection });
  if (await editor.getAttribute('open') === null) await selection.click();
  await expect(editor).toHaveJSProperty('open', true);
  const portion = breakfastPortion(page);
  await expect(portion).toBeVisible(); await expect(portion).toBeEnabled();
  await portion.selectOption('1.25'); await expect(portion).toHaveValue('1.25');
  const generate = page.getByRole('button', { name: 'Посмотреть меню на день', exact: true });
  await expect(generate).toBeEnabled(); await generate.click();
}
export async function confirmPreview(page: Page) {
  await preview(page);
  await page.getByRole('button', { name: 'Подтвердить меню', exact: true }).click();
}

export function isExpectedStateProtocolRejection(error: string): boolean {
  return /Failed to load resource:.*\b426 \(Upgrade Required\)/.test(error);
}
export async function healthy(page: Page, errors: string[]) { await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]); }
