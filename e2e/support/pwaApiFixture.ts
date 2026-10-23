import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildMockProfile } from './appHarness';
import { familyTestMenu } from '../../tests/_helpers/familyMenu';
import { isFamilyPlanningMenu, isPurchaseOnlyChange, type PlannedFamilyMenu } from '../../domain/familyPlanning';
import { planningDay, planningRoster, confirmedConfiguration } from './familyPlanningFixture';

const account = 'google-e2e-sub', initialSessionId = 'a'.repeat(64), familyId = 'family-durable-e2e';
const headers = { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': account,
  ...Object.fromEntries(['State', 'Profile', 'Bootstrap', 'AI', 'Weekly-Menu', 'Achievements', 'Huawei', 'Push', 'Family', 'Family-Menu'].flatMap(resource =>
    [[`X-FitFocus-${resource}-Protocol`, resource === 'State' ? '2' : '1'], [`X-FitFocus-${resource}-Guard`, '1']])) };

/** Synthetic HTTP backend shared by both releases; no request interception or SW replacement. */
export function createPwaApiFixture(options: { familyPlanning?: boolean; retryAfterSeconds?: number; unauthenticated?: boolean; familyPutDelayMs?: number;
  retryFamilyPutDelayMs?: number; conflictFirstFamilyPut?: boolean; stateUnavailable?: boolean; currentStateUnavailable?: boolean;
  achievementCheckGate?: { started: (scope: { method: string | undefined; account: string | undefined; session: string | undefined }) => void; wait: Promise<void> };
  profileGetGate?: { shouldHold: () => boolean; started: () => void; wait: Promise<void> } } = {}) {
  let sessionId = initialSessionId;
  let disconnectStateWrites = false;
  let profile: Record<string, unknown> = { ...buildMockProfile(), ...(options.familyPlanning ? { plan: 'family' } : {}) };
  // Keep legacy /family/menu data separate: retained v2 clients still exercise their original payload.
  const structuredDays = new Map<string, { version: number; menu: PlannedFamilyMenu }>();
  const familyWrites: Array<{ familyId: string; weekStart: string; baseVersion: number; mutationKind: string; account: string; session: string }> = [];
  const structuredDay = (date: string) => {
    let day = structuredDays.get(date);
    if (!day) { day = { version: 1, menu: planningDay(account, date, 0.75) }; structuredDays.set(date, day); }
    return day;
  };
  let week = familyTestMenu(account).weekStart;
  let available = options.conflictFirstFamilyPut === true, familyVersion = 1, familyMenu = familyTestMenu(account, 400, week);
  let firstFamilyConflictInjected = false, stateAvailable = options.stateUnavailable !== true;
  let currentStateAvailable = options.currentStateUnavailable !== true;
  const stateWriteKeys: string[] = [];
  const stateWriteItems: Array<{ key: string; value: string; baseVersion: number }> = [];
  const unexpectedApi: string[] = [], counts = { put: 0, preview: 0, profile: 0, profileGet: 0, accepted: 0, acceptedAtMs: null as number | null,
    me: 0, logout: 0, pushSubscribe: 0, oauth: 0, familyPutAborted: 0, legacyStatePutAttempts: 0, legacyStateScopeRejected: 0,
    legacyStateProtocolRejected: 0, stateProtocolRejected: 0,
    currentStatePutAttempts: 0, currentStatePutAccepted: 0, currentStatePutTransportAborted: 0, structuredOldWriterRejected: 0 };
  const pushRequests: Array<{ path: string; method: string; account: string | null; session: string | null }> = [];
  return { unexpectedApi, counts, stateWriteKeys, stateWriteItems, pushRequests, familyWrites,
    setStateWriteDisconnected: (disconnected: boolean) => { disconnectStateWrites = disconnected; },
    setActiveSessionId: (nextSessionId: string) => { sessionId = nextSessionId; },
    recoverState: () => { stateAvailable = true; },
    recoverCurrentState: () => { currentStateAvailable = true; }, recover: (conflict = false) => {
    available = true;
    stateAvailable = true;
    if (conflict) { familyVersion += 1; familyMenu = familyTestMenu(account, 900, week); }
  }, async respond(request: IncomingMessage, response: ServerResponse, url: URL) {
    const path = url.pathname, method = request.method;
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => {
      response.writeHead(status, { ...headers, 'X-FitFocus-State-Session': sessionId, ...extra });
      response.end(JSON.stringify(body));
    };
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const legacySingleStateWrite = path === '/api/state' && method === 'PUT' && typeof body.key === 'string';
    if (legacySingleStateWrite) {
      counts.legacyStatePutAttempts += 1;
      if (!stateAvailable) return json({ error: 'INJECTED_STATE_UNAVAILABLE' }, 503);
    }
    if (method !== 'GET' && !['/api/achievements/check'].includes(path) && path !== '/api/ai' && path !== '/api/logout'
      && (request.headers['x-fitfocus-state-account'] !== account || request.headers['x-fitfocus-state-session'] !== sessionId)) {
      if (legacySingleStateWrite) { counts.legacyStateScopeRejected += 1; return json({ error: 'INVALID_SCOPE' }, 403); }
      unexpectedApi.push(`INVALID_SCOPE:${path}`); return json({ error: 'INVALID_SCOPE' }, 403);
    }
    if (path === '/api/state' && method !== 'GET' && request.headers['x-fitfocus-state-protocol'] !== '2') {
      counts.stateProtocolRejected += 1;
      if (legacySingleStateWrite) counts.legacyStateProtocolRejected += 1;
      return json({ error: 'STATE_PROTOCOL_REQUIRED' }, 426);
    }
    if (path === '/api/env') return json({ requireInvite: false });
    if (path === '/api/me') counts.me += 1;
    if (options.unauthenticated && path === '/api/me') return json({ user: null, hasAccess: false });
    if (options.unauthenticated && path === '/api/auth/google/start') {
      counts.oauth += 1;
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>OAuth fixture</title></head><body><h1>Server OAuth endpoint</h1></body></html>');
      return;
    }
    if (path === '/api/me') return json({ user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId },
      ...Object.fromEntries(['bootstrapSync', 'profileSync', 'aiSync', 'weeklyMenuSync', 'achievementSync', 'huaweiSync', 'pushSync', 'familySync'].map(name =>
        [name, { protocol: 1, guard: 1, ...(name === 'profileSync' ? { weeklyMenuProjection: 1 } : {}), ...(name === 'familySync' ? { target: 1 } : {}) }])),
      familyMenuSync: { protocol: 1, guard: 1, cas: 1 }, ...(options.familyPlanning ? { familyPlanning: { version: 1 } } : {}) });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile') {
      if (method === 'PUT') { counts.profile += 1; profile = { ...body, version: Number(body.baseVersion) + 1 }; }
      if (method === 'GET') {
        counts.profileGet += 1;
        if (options.profileGetGate?.shouldHold()) {
          options.profileGetGate.started();
          await options.profileGetGate.wait;
          if (response.destroyed) return;
        }
      }
      return json({ profile, version: profile.version });
    }
    if (path === '/api/state') {
      if (method === 'GET') return json({ items: [] });
      if (method !== 'PUT' || legacySingleStateWrite || !Array.isArray(body.items)) {
        unexpectedApi.push(`INVALID_STATE_WRITE:${method}`); return json({ error: 'INVALID_STATE_WRITE' }, 400);
      }
      const items = body.items as Array<{ key: string; value: string; baseVersion: number }>;
      counts.currentStatePutAttempts += 1;
      if (disconnectStateWrites) {
        counts.currentStatePutTransportAborted += 1;
        response.destroy();
        return;
      }
      if (!currentStateAvailable) return json({ error: 'INJECTED_STATE_UNAVAILABLE' }, 503);
      if (items.some(item => item.key.includes('_family_menu:'))) {
        unexpectedApi.push('WRONG_FAMILY_RESOURCE'); return json({ error: 'WRONG_RESOURCE' }, 403);
      }
      counts.currentStatePutAccepted += 1;
      stateWriteKeys.push(...items.map(item => item.key));
      stateWriteItems.push(...items.map(({ key, value, baseVersion }) => ({ key, value, baseVersion })));
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/family') return json({ family: { id: familyId, name: 'Семья с постоянным меню', owner_user_id: account },
      members: [{ user_id: account, role: 'owner', status: 'active' }] });
    if (options.familyPlanning && (path.startsWith('/api/family/dining-profile') || path === '/api/family/menu/state'
      || path === '/api/family/menu/generate' || path === '/api/family/menu/archive')
      && (request.headers['x-fitfocus-state-account'] !== account || request.headers['x-fitfocus-state-session'] !== sessionId)) {
      unexpectedApi.push(`INVALID_STRUCTURED_SCOPE:${path}`); return json({ error: 'INVALID_SCOPE' }, 403);
    }
    if (options.familyPlanning && (path === '/api/family/menu' && method !== 'GET' || path === '/api/shopping/check')) {
      counts.structuredOldWriterRejected += 1; return json({ error: 'STRUCTURED_PLANNING_REQUIRED' }, 409);
    }
    if (options.familyPlanning && path === '/api/family/dining-profiles' && method === 'GET') {
      return json({ roster: planningRoster(familyId, account) });
    }
    if (options.familyPlanning && path === '/api/family/dining-profile' && method === 'GET') {
      return json({ profile: { ...planningRoster(familyId, account).profiles[0], configuration: confirmedConfiguration } });
    }
    if (options.familyPlanning && path === '/api/family/menu/archive' && method === 'GET') return json({ archives: [] });
    if (options.familyPlanning && path === '/api/family/menu/generate') {
      if (method !== 'POST' || body.preview !== true || body.familyId !== familyId || typeof body.date !== 'string' || body.rosterVersion !== 1 || !Array.isArray(body.selections)) {
        counts.structuredOldWriterRejected += 1; return json({ error: 'STRUCTURED_PLANNING_REQUIRED' }, 409);
      }
      counts.preview += 1;
      const menu = planningDay(account, body.date, 1, body.selections as Parameters<typeof planningDay>[3]);
      return json({ preview: true, rosterVersion: 1, profileVersions: menu.planningV1.profileVersions,
        shared: { familyId, weekStart: body.date, menu } });
    }
    if (options.familyPlanning && path === '/api/family/menu/state') {
      const date = method === 'GET' ? url.searchParams.get('week') : body.weekStart;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'BAD_DATE' }, 400);
      const day = structuredDay(date);
      const snapshot = () => ({ familyId, weekStart: date, version: day.version, menu: day.menu });
      if (method === 'GET') return json({ ok: true, snapshot: snapshot() });
      if (method !== 'PUT' || body.familyId !== familyId || !['planning', 'purchases'].includes(String(body.mutationKind)) || !isFamilyPlanningMenu(body.menu, date)) {
        counts.structuredOldWriterRejected += 1; return json({ error: 'STRUCTURED_PLANNING_REQUIRED' }, 409);
      }
      counts.put += 1;
      familyWrites.push({ familyId, weekStart: date, baseVersion: Number(body.baseVersion), mutationKind: String(body.mutationKind),
        account: String(request.headers['x-fitfocus-state-account']), session: String(request.headers['x-fitfocus-state-session']) });
      const delayMs = counts.put > 1 ? options.retryFamilyPutDelayMs ?? options.familyPutDelayMs : options.familyPutDelayMs;
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      if (response.destroyed) { counts.familyPutAborted += 1; return; }
      if (options.conflictFirstFamilyPut && !firstFamilyConflictInjected) {
        firstFamilyConflictInjected = true; day.version += 1; day.menu = planningDay(account, date, 1);
        return json({ error: 'VERSION_CONFLICT', snapshot: snapshot() }, 409);
      }
      if (!available) return json({ error: 'INJECTED_OFFLINE' }, 503,
        options.retryAfterSeconds === undefined ? {} : { 'Retry-After': String(options.retryAfterSeconds) });
      if (body.baseVersion !== day.version) return json({ error: 'VERSION_CONFLICT', snapshot: snapshot() }, 409);
      if (body.mutationKind === 'purchases' && !isPurchaseOnlyChange(day.menu.planningV1, body.menu.planningV1)) {
        return json({ error: 'INVALID_PURCHASE_CHANGE' }, 409);
      }
      day.menu = body.menu; day.version += 1; counts.accepted += 1; counts.acceptedAtMs = Date.now();
      return json({ ok: true, snapshot: snapshot() });
    }
    if (path === '/api/family/menu') {
      week = url.searchParams.get('week') ?? week;
      return json({ weekStart: week, shared: { familyId, version: familyVersion, menu: { ...familyMenu, weekStart: week } }, portions: null });
    }
    if (path === '/api/family/menu/state') {
      if (method === 'PUT') {
        counts.put += 1;
        const delayMs = counts.put > 1 ? options.retryFamilyPutDelayMs ?? options.familyPutDelayMs : options.familyPutDelayMs;
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        if (response.destroyed) { counts.familyPutAborted += 1; return; }
        if (options.conflictFirstFamilyPut && !firstFamilyConflictInjected) {
          firstFamilyConflictInjected = true;
          familyVersion += 1;
          familyMenu = familyTestMenu(account, 900, week);
          return json({ error: 'VERSION_CONFLICT', snapshot: { familyId, weekStart: week, version: familyVersion, menu: familyMenu } }, 409);
        }
        if (!available) return json({ error: 'INJECTED_OFFLINE' }, 503,
          options.retryAfterSeconds === undefined ? {} : { 'Retry-After': String(options.retryAfterSeconds) });
        if (body.familyId !== familyId || body.weekStart !== week) {
          unexpectedApi.push('WRONG_FAMILY_TARGET'); return json({ error: 'WRONG_TARGET' }, 403);
        }
        if (body.baseVersion !== familyVersion) return json({ snapshot: { familyId, weekStart: week, version: familyVersion, menu: familyMenu } }, 409);
        familyMenu = body.menu as typeof familyMenu; familyVersion += 1; counts.accepted += 1; counts.acceptedAtMs = Date.now();
      }
      return json({ ok: true, snapshot: { familyId, weekStart: week, version: familyVersion, menu: { ...familyMenu, weekStart: week } } });
    }
    if (path === '/api/family/menu/generate' && body.preview === true && body.familyId === familyId) {
      counts.preview += 1; return json({ preview: true, shared: { familyId, weekStart: week, menu: familyTestMenu(account, 700, week) } });
    }
    if (path === '/api/shopping/list') return json({ family_id: familyId, week_start: week,
      items: familyMenu.shoppingListItems?.map(item => ({ ...item, checked: false })) });
    if (path === '/api/achievements/check' && method === 'POST' && options.achievementCheckGate) {
      options.achievementCheckGate.started({ method, account: request.headers['x-fitfocus-state-account'] as string | undefined,
        session: request.headers['x-fitfocus-state-session'] as string | undefined });
      await options.achievementCheckGate.wait;
      if (response.destroyed) return;
    }
    if (path === '/api/achievements' || path === '/api/achievements/check') return json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] });
    if (path === '/api/ai' && body.feature === 'wis_text') return json({ text: 'E2E: питание и прогресс остаются в пределах персонального плана.' });
    if (path === '/api/wearable/huawei/status') return json({ connected: false, configured: false });
    if (path === '/api/logout' && method === 'POST') { counts.logout += 1; return json({ ok: true }); }
    if (path === '/api/push/subscribe' && method === 'POST') {
      counts.pushSubscribe += 1;
      const accountHeader = request.headers['x-fitfocus-state-account'];
      const sessionHeader = request.headers['x-fitfocus-state-session'];
      pushRequests.push({ path, method, account: typeof accountHeader === 'string' ? accountHeader : null,
        session: typeof sessionHeader === 'string' ? sessionHeader : null });
      return json({ ok: true });
    }
    if (path === '/api/push/status') return json({ configured: false, current_subscription_id: null, count: 0, subscriptions: [] });
    unexpectedApi.push(`${method}:${path}`); return json({ error: 'UNMOCKED_API' }, 500);
  } };
}
