import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { sub: 'generation-user', sid: 'generation-session', roles: ['user'] } }));

vi.mock('../functions/api/_lib/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../functions/api/_lib/auth')>(),
  requireUser: vi.fn(async () => mocks.user),
}));

vi.mock('../functions/api/_lib/access', async (importOriginal) => ({
  ...await importOriginal<typeof import('../functions/api/_lib/access')>(),
  requireBetaAccess: vi.fn(async () => undefined),
}));

import { onRequestDelete, onRequestGet, onRequestPut } from '../functions/api/state';
import { stateSessionId } from '../functions/api/_lib/state_session';
import { sqliteD1 } from './_helpers/sqliteD1';

const key = `fitfocus_data_${mocks.user.sub}_settings`;
type StateContext = Parameters<typeof onRequestPut>[0];

let fixture: ReturnType<typeof sqliteD1>;
let env: StateContext['env'];

beforeEach(() => {
  fixture = sqliteD1();
  env = { DB: fixture.db, AUTH_JWT_SECRET: 'route-test-secret' };
});

afterEach(() => fixture.sqlite.close());

async function request(method: string, url: string, body?: unknown): Promise<Request> {
  return new Request(`https://fitfocus.test${url}`, {
    method,
    headers: {
      'X-FitFocus-State-Account': mocks.user.sub,
      'X-FitFocus-State-Session': await stateSessionId(mocks.user),
      ...(method === 'PUT' || method === 'DELETE' ? { 'X-FitFocus-State-Protocol': '2' } : {}),
      ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(request: Request): StateContext {
  return {
    request,
    env,
    params: {},
    data: {},
    waitUntil: () => undefined,
    next: () => Promise.resolve(new Response(null, { status: 404 })),
  };
}

describe('/api/state generation lifecycle', () => {
  it('rejects stale writes across delete and recreate through the HTTP handlers', async () => {
    const created = await onRequestPut(context(await request('PUT', '/api/state', {
      key,
      value: '{"version":"original"}',
      baseVersion: 0,
    })));
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toMatchObject({
      ok: true,
      items: [{ key, version: 1, exists: true }],
    });

    const deleted = await onRequestDelete(context(await request('DELETE', `/api/state?key=${encodeURIComponent(key)}&baseVersion=1`)));
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toMatchObject({ ok: true, key, version: 2, exists: false });

    const accountPrefix = `fitfocus_data_${mocks.user.sub}_`;
    const tombstone = await onRequestGet(context(await request('GET', `/api/state?prefix=${encodeURIComponent(accountPrefix)}&includeDeleted=1`)));
    expect(tombstone.status).toBe(200);
    await expect(tombstone.json()).resolves.toMatchObject({
      items: [{ key, value: '', version: 2, exists: false }],
    });

    const staleDuringDeletion = await onRequestPut(context(await request('PUT', '/api/state', {
      key,
      value: '{"version":"stale-after-delete"}',
      baseVersion: 1,
    })));
    expect(staleDuringDeletion.status).toBe(409);
    await expect(staleDuringDeletion.json()).resolves.toMatchObject({
      error: 'KV_CONFLICT', key, value: '', version: 2, exists: false,
    });

    const recreated = await onRequestPut(context(await request('PUT', '/api/state', {
      key,
      value: '{"version":"recreated"}',
      baseVersion: 2,
    })));
    expect(recreated.status).toBe(200);
    await expect(recreated.json()).resolves.toMatchObject({
      ok: true,
      items: [{ key, version: 3, exists: true }],
    });

    const staleAfterRecreate = await onRequestPut(context(await request('PUT', '/api/state', {
      key,
      value: '{"version":"stale-original"}',
      baseVersion: 1,
    })));
    expect(staleAfterRecreate.status).toBe(409);
    await expect(staleAfterRecreate.json()).resolves.toMatchObject({
      error: 'KV_CONFLICT', key, value: '{"version":"recreated"}', version: 3, exists: true,
    });

    expect(fixture.sqlite.prepare('SELECT v, version, deleted_at FROM user_kv WHERE user_id = ? AND k = ?')
      .get(mocks.user.sub, key)).toMatchObject({ v: '{"version":"recreated"}', version: 3, deleted_at: null });
  });
});
