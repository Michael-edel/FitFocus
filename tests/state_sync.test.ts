import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { StateSync } from '../storage/stateSync';

const account = 'account-a';
const key = `fitfocus_data_${account}_settings`;
const sessionId = 'a'.repeat(64);
const proof = (id = account, sid = sessionId) => ({ user: { sub: id }, hasAccess: true, stateSync: { protocol: 2, guard: 1, accountId: id, sessionId: sid } });
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const scope = { 'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId };
let db: StateDatabase;
let secondDb: StateDatabase;
let outbox: DurableOutbox;
let now: number;
const clients: StateSync[] = [];
beforeEach(() => {
  const factory = new IDBFactory(); db = new StateDatabase({ factory }); secondDb = new StateDatabase({ factory });
  outbox = new DurableOutbox(db); now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { clients.splice(0).forEach((client) => client.stop()); db.close(); secondDb.close(); vi.restoreAllMocks(); });
const write = (type: 'put' | 'delete' = 'put') => outbox.write({ accountId: account, writerId: 'editor', expectedRevision: 0, baseVersion: 0,
  intent: type === 'put' ? { type, key, value: '{"theme":"light"}' } : { type, key } });
function client(mutation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, me: () => Response | Promise<Response> = () => json(proof()), options = {}) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => String(url) === '/api/me' ? me() : mutation(url, init));
  const instance = new StateSync({ outbox, fetchImpl: fetchFn, now: () => now, random: () => 0.5, legacyPending: () => false, ...options });
  clients.push(instance); return { instance, fetchFn };
}
const ack = (version = 1) => json({ ok: true, items: [{ key, version, exists: true }] }, 200, scope);

describe('durable HTTP sender', () => {
  it('starts HTTP only after claim commit, uses scoped CAS and accepts the actual returned version', async () => {
    await write();
    const { instance } = client(async (url, init) => {
      expect((await new DurableOutbox(secondDb).list(account))[0].status).toBe('sending');
      expect(url).toBe('/api/state'); expect(init?.method).toBe('PUT');
      expect(new Headers(init?.headers).get('X-FitFocus-State-Session')).toBe(sessionId);
      expect(JSON.parse(String(init?.body)).items[0]).toMatchObject({ key, baseVersion: 0 });
      return ack(7);
    });
    expect(await instance.connect(account)).toBe(true); await instance.flush();
    expect(await outbox.list(account)).toEqual([]);
    expect(await outbox.snapshot(account, key)).toMatchObject({ confirmedVersion: 7, value: '{"theme":"light"}' });
  });

  it('sends delete as delete and retains absence after a verified acknowledgement', async () => {
    await write('delete');
    const { instance } = client(async (url, init) => {
      expect(init?.method).toBe('DELETE'); expect(String(url)).toContain(`key=${encodeURIComponent(key)}&baseVersion=0`);
      expect(init?.body).toBeUndefined(); return json({ ok: true, key, version: 4, exists: false }, 200, scope);
    });
    await instance.connect(account); await instance.flush();
    expect(await outbox.list(account)).toEqual([]);
    expect(await outbox.snapshot(account, key)).toMatchObject({ value: null, confirmedVersion: 4 });
  });

  it.each([
    [401, 'UNAUTH', 'pending', 'auth'], [403, 'ACCESS_REQUIRED', 'pending', 'access'],
    [403, 'FORBIDDEN_KEYSPACE', 'failed', undefined], [403, 'OTHER', 'failed', undefined],
    [400, 'BAD_JSON', 'failed', undefined], [404, 'NOT_FOUND', 'failed', undefined],
    [408, '', 'pending', undefined], [429, '', 'pending', undefined], [500, '', 'pending', undefined],
  ])('retains status %s with the appropriate pause or failure', async (status, error, expected, pause) => {
    await write(); const { instance } = client(async () => json({ error }, status));
    await instance.connect(account); await instance.flush();
    expect((await outbox.list(account))[0]).toMatchObject({ status: expected, value: '{"theme":"light"}' });
    expect((await outbox.sessionState()).active?.pause).toBe(pause);
    expect((await outbox.snapshot(account, key)).value).toContain('light');
  });

  it.each(['put', 'delete'] as const)('retains %s conflict, payload/intent and available snapshot across a new connection', async (type) => {
    await write(type);
    const { instance } = client(async () => json({ error: 'KV_CONFLICT', key, version: 9, exists: false, value: '' }, 409, scope));
    await instance.connect(account); await instance.flush();
    const operations = await new DurableOutbox(secondDb).list(account);
    expect(operations[0]).toMatchObject({ type, status: 'conflicted', baseVersion: 0, serverSnapshot: { version: 9, exists: false, value: '' } });
    if (type === 'delete') expect(operations[0]).not.toHaveProperty('value');
  });

  it.each(['missing-scope', 'wrong-key', 'wrong-version', 'wrong-exists', 'missing-ok'])('does not invent an ack for %s', async (fault) => {
    await write(); const { instance } = client(async () => json({ ok: fault !== 'missing-ok', items: [{ key: fault === 'wrong-key' ? 'other' : key,
      version: fault === 'wrong-version' ? 0 : 1, exists: fault !== 'wrong-exists' }] }, 200, fault === 'missing-scope' ? {} : scope));
    await instance.connect(account); await instance.flush();
    expect((await outbox.list(account))[0]).toMatchObject({ status: 'pending', retryCount: 0 });
    expect((await outbox.sessionState()).active?.pause).toBe('protocol');
    expect((await outbox.snapshot(account, key)).confirmedVersion).toBe(0);
  });

  it('waits on an old server and never activates an inferred identity', async () => {
    await write(); const { instance, fetchFn } = client(async () => ack(), () => json({ user: { sub: account }, hasAccess: true }));
    expect(await instance.connect(account)).toBe(false); await instance.flush();
    expect(fetchFn).toHaveBeenCalledTimes(1); expect((await outbox.list(account))[0].status).toBe('pending');
    expect((await outbox.sessionState()).active).toBeUndefined();
  });

  it('rejects a proof for another account without sending the local account queue', async () => {
    await write(); const { instance, fetchFn } = client(async () => ack(), () => json(proof('account-b')));
    expect(await instance.connect(account)).toBe(false); await instance.flush(); expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('saves during auth pause and resumes only after a new successful server verification', async () => {
    const first = await write(); let authorized = false; let version = 0;
    const { instance } = client(async () => authorized ? ack(++version) : json({ error: 'UNAUTH' }, 401));
    await instance.connect(account); await instance.flush();
    const oldEpoch = (await outbox.sessionState()).active!.sessionEpoch;
    const pausedFence = (await outbox.sessionState()).fence;
    expect(await outbox.acceptSession(account, sessionId, pausedFence - 1)).toBeNull();
    await outbox.write({ accountId: account, writerId: 'editor', expectedRevision: first.revision, baseVersion: 0, parentOpId: first.opId,
      intent: { type: 'put', key, value: '{"theme":"violet"}' } });
    await instance.flush(); expect(await outbox.list(account)).toHaveLength(2);
    authorized = true; await instance.connect(account); await instance.flush();
    expect((await outbox.sessionState()).active!.sessionEpoch).not.toBe(oldEpoch);
    expect(await outbox.list(account)).toEqual([]); expect((await outbox.snapshot(account, key)).confirmedVersion).toBe(2);
  });

  it('shares one verified epoch across tabs and claims a key only once', async () => {
    await write(); let release!: (value: Response) => void; const response = new Promise<Response>((resolve) => { release = resolve; });
    const first = client(() => response); const second = client(async () => { throw new Error('duplicate HTTP'); });
    await first.instance.connect(account); const epoch = (await outbox.sessionState()).active!.sessionEpoch;
    await second.instance.connect(account); expect((await outbox.sessionState()).active!.sessionEpoch).toBe(epoch);
    const flushing = first.instance.flush(); await vi.waitFor(async () => expect((await outbox.list(account))[0].status).toBe('sending'));
    await second.instance.flush(); expect(second.fetchFn).toHaveBeenCalledTimes(1);
    release(ack()); await flushing; expect(await outbox.list(account)).toEqual([]);
  });

  it('logout fences an in-flight /me response and rejects the logged-out server session until it changes', async () => {
    const connected = client(async () => ack()); await connected.instance.connect(account);
    const fence = (await outbox.sessionState()).fence;
    await connected.instance.invalidate();
    expect(await outbox.acceptSession(account, sessionId, fence)).toBeNull();
    expect(await outbox.acceptSession(account, sessionId, (await outbox.sessionState()).fence)).toBeNull();
    expect(await outbox.acceptSession(account, 'b'.repeat(64), (await outbox.sessionState()).fence)).not.toBeNull();
    let release!: (value: Response) => void;
    const waiting = client(async () => ack(), () => new Promise<Response>((resolve) => { release = resolve; }));
    const connecting = waiting.instance.connect(account); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await waiting.instance.invalidate(); release(json(proof())); expect(await connecting).toBe(false);
    expect((await outbox.sessionState()).active).toBeUndefined();
  });

  it('ignores a late acknowledgement after session replacement and reclaims the old attempt immediately', async () => {
    await write(); let release!: (value: Response) => void;
    const old = client(() => new Promise<Response>((resolve) => { release = resolve; }));
    await old.instance.connect(account); const flushing = old.instance.flush();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const newSession = await outbox.acceptSession(account, 'b'.repeat(64), (await outbox.sessionState()).fence);
    release(ack(8)); await flushing;
    expect(await outbox.list(account)).toHaveLength(1); expect((await outbox.snapshot(account, key)).confirmedVersion).toBe(0);
    const recovered = await outbox.claim({ accountId: account, sessionEpoch: newSession!.sessionEpoch, owner: 'new-tab', nowMs: now, leaseMs: 30_000 });
    expect(recovered).not.toBeNull();
  });

  it('honours bounded Retry-After and stops retrying after eight failed attempts', async () => {
    await write(); const { instance, fetchFn } = client(async () => json({}, 429, { 'Retry-After': '99999999' }));
    await instance.connect(account);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await instance.flush(); const operation = (await outbox.list(account))[0];
      if (attempt < 7) { expect(operation.nextAttemptAtMs - now).toBe(900_000); now = operation.nextAttemptAtMs; }
    }
    expect((await outbox.list(account))[0]).toMatchObject({ status: 'failed', reason: 'retry-exhausted' });
    expect(fetchFn).toHaveBeenCalledTimes(9);
  });

  it('keeps a lost-response operation when a repeat receives 409, even if the values match', async () => {
    await write(); let sent = false;
    const { instance } = client(async () => {
      if (!sent) { sent = true; throw new Error('response lost after commit'); }
      return json({ error: 'KV_CONFLICT', key, value: '{"theme":"light"}', version: 1, exists: true }, 409, scope);
    });
    await instance.connect(account); await instance.flush(); now = (await outbox.list(account))[0].nextAttemptAtMs;
    await instance.flush(); expect((await outbox.list(account))[0].status).toBe('conflicted');
    expect((await outbox.snapshot(account, key)).confirmedVersion).toBe(0);
  });

  it('times out a response that sends headers but never completes its body', async () => {
    await write(); const { instance } = client(async () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: scope }), undefined, { timeoutMs: 25 });
    await instance.connect(account); await instance.flush();
    expect((await outbox.list(account))[0]).toMatchObject({ status: 'pending', reason: 'network-or-timeout', retryCount: 1 });
  });

  it('fresh simultaneous proofs converge through the fence rather than invalidating the other tab', async () => {
    const releases: ((value: Response) => void)[] = [];
    const verify = () => releases.length < 2 ? new Promise<Response>((resolve) => releases.push(resolve)) : json(proof());
    const first = client(async () => ack(), verify);
    const second = client(async () => ack(), verify, { outbox: new DurableOutbox(secondDb) });
    const both = Promise.all([first.instance.connect(account), second.instance.connect(account)]);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.forEach((release) => release(json(proof())));
    expect(await both).toEqual([true, true]);
    expect((await outbox.sessionState()).fence).toBe(1);
  });

  it('does not accept an oversized response or advance the confirmed version', async () => {
    await write(); const { instance } = client(async () => new Response('x'.repeat(1024 * 1024 + 1), { headers: scope }));
    await instance.connect(account); await instance.flush();
    expect((await outbox.list(account))[0].status).toBe('pending');
    expect((await outbox.snapshot(account, key)).confirmedVersion).toBe(0);
  });

  it('retains new changes without HTTP while the legacy source still needs verified runtime migration', async () => {
    await write(); const { instance, fetchFn } = client(async () => ack(), undefined, { legacyPending: () => true });
    await instance.connect(account); await instance.flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await outbox.list(account))[0]).toMatchObject({ status: 'pending', retryCount: 0, reason: 'legacy-import-required' });
    expect((await outbox.sessionState()).active?.pause).toBe('legacy');
  });

  it('verifies the session again when a temporary legacy pause no longer has a source', async () => {
    await write(); let pending = true;
    const { instance, fetchFn } = client(async () => ack(), undefined, { legacyPending: () => pending });
    await instance.connect(account); await instance.flush(); pending = false; await instance.flush();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(await outbox.list(account)).toEqual([]);
  });
});
