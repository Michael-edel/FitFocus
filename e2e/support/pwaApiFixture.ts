import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildMockProfile } from './appHarness';
import { familyTestMenu } from '../../tests/_helpers/familyMenu';

const account = 'google-e2e-sub', sid = 'a'.repeat(64), familyId = 'family-durable-e2e';
const headers = { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid,
  ...Object.fromEntries(['State', 'Profile', 'Bootstrap', 'AI', 'Weekly-Menu', 'Achievements', 'Family', 'Family-Menu'].flatMap(resource =>
    [[`X-FitFocus-${resource}-Protocol`, resource === 'State' ? '2' : '1'], [`X-FitFocus-${resource}-Guard`, '1']])) };

/** Synthetic HTTP backend shared by both releases; no request interception or SW replacement. */
export function createPwaApiFixture() {
  let profile: Record<string, unknown> = buildMockProfile();
  let week = familyTestMenu(account).weekStart;
  const unexpectedApi: string[] = [], counts = { put: 0, preview: 0, profile: 0 };
  return { unexpectedApi, counts, async respond(request: IncomingMessage, response: ServerResponse, url: URL) {
    const path = url.pathname, method = request.method;
    const json = (body: unknown, status = 200) => { response.writeHead(status, headers); response.end(JSON.stringify(body)); };
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (method !== 'GET' && !['/api/achievements/check'].includes(path) && path !== '/api/ai'
      && (request.headers['x-fitfocus-state-account'] !== account || request.headers['x-fitfocus-state-session'] !== sid)) {
      unexpectedApi.push(`INVALID_SCOPE:${path}`); return json({ error: 'INVALID_SCOPE' }, 403);
    }
    if (path === '/api/env') return json({ requireInvite: false });
    if (path === '/api/me') return json({ user: { sub: account, roles: ['user'] }, hasAccess: true,
      stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
      ...Object.fromEntries(['bootstrapSync', 'profileSync', 'aiSync', 'weeklyMenuSync', 'achievementSync', 'familySync'].map(name =>
        [name, { protocol: 1, guard: 1, ...(name === 'profileSync' ? { weeklyMenuProjection: 1 } : {}) }])),
      familyMenuSync: { protocol: 1, guard: 1, cas: 1 } });
    if (path === '/api/bootstrap') return json({ user: { sub: account }, profile, items: [] });
    if (path === '/api/profile') {
      if (method === 'PUT') { counts.profile += 1; profile = { ...body, version: Number(body.baseVersion) + 1 }; }
      return json({ profile, version: profile.version });
    }
    if (path === '/api/state') {
      if (method === 'GET') return json({ items: [] });
      const items = body.items as Array<{ key: string; baseVersion: number }>;
      if (items.some(item => item.key.includes('_family_menu:'))) {
        unexpectedApi.push('WRONG_FAMILY_RESOURCE'); return json({ error: 'WRONG_RESOURCE' }, 403);
      }
      return json({ ok: true, items: items.map(item => ({ key: item.key, version: item.baseVersion + 1, exists: true })) });
    }
    if (path === '/api/family') return json({ family: { id: familyId, name: 'Семья с постоянным меню', owner_user_id: account },
      members: [{ user_id: account, role: 'owner', status: 'active' }] });
    if (path === '/api/family/menu') {
      week = url.searchParams.get('week') ?? week;
      return json({ weekStart: week, shared: { familyId, version: 1, menu: familyTestMenu(account, 400, week) }, portions: null });
    }
    if (path === '/api/family/menu/state') {
      if (method === 'PUT') { counts.put += 1; return json({ error: 'INJECTED_OFFLINE' }, 503); }
      return json({ ok: true, snapshot: { familyId, weekStart: week, version: 1, menu: familyTestMenu(account, 400, week) } });
    }
    if (path === '/api/family/menu/generate' && body.preview === true && body.familyId === familyId) {
      counts.preview += 1; return json({ preview: true, shared: { familyId, weekStart: week, menu: familyTestMenu(account, 700, week) } });
    }
    if (path === '/api/shopping/list') return json({ family_id: familyId, week_start: week,
      items: familyTestMenu(account, 400, week).shoppingListItems?.map(item => ({ ...item, checked: false })) });
    if (path === '/api/achievements' || path === '/api/achievements/check') return json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] });
    if (path === '/api/ai' && body.feature === 'wis_text') return json({ text: 'E2E: питание и прогресс остаются в пределах персонального плана.' });
    if (path === '/api/wearable/huawei/status') return json({ connected: false, configured: false });
    if (path === '/api/push/status') return json({ configured: false, current_subscription_id: null, count: 0, subscriptions: [] });
    unexpectedApi.push(`${method}:${path}`); return json({ error: 'UNMOCKED_API' }, 500);
  } };
}
