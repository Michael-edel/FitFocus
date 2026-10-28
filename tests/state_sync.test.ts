import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DurableOutbox } from '../storage/durableOutbox';
import { StateDatabase, STATE_STORES, indexedRequest, stateTransaction } from '../storage/stateDatabase';
import { StateSync } from '../storage/stateSync';
import { LegacyQueueMigration, type MigrationItem } from '../storage/legacyMigration';
import { LEGACY_QUEUE_SOURCE_KEY } from '../storage/legacyQueue';
import { userProfile } from './_helpers/userProfile';

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
afterEach(() => { clients.splice(0).forEach((client) => client.stop()); db.close(); secondDb.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const write = (type: 'put' | 'delete' = 'put') => outbox.write({ accountId: account, writerId: 'editor', expectedRevision: 0, baseVersion: 0,
  intent: type === 'put' ? { type, key, value: '{"theme":"light"}' } : { type, key } });
function client(mutation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, me: () => Response | Promise<Response> = () => json(proof()), options = {}) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => String(url) === '/api/me' ? me() : mutation(url, init));
  const instance = new StateSync({ outbox, fetchImpl: fetchFn, now: () => now, random: () => 0.5, legacyPending: () => false, ...options });
  clients.push(instance); return { instance, fetchFn };
}
const ack = (version = 1) => json({ ok: true, items: [{ key, version, exists: true }] }, 200, scope);

async function importLegacyConflict(targetKey = key, value = '{"theme":"light"}') {
  const record = { type: 'put', key: targetKey, value };
  const raw = JSON.stringify([record]);
  const migration = new LegacyQueueMigration({ getItem: (requested) => requested === LEGACY_QUEUE_SOURCE_KEY ? raw : null }, db);
  await migration.migrate({ verifiedOwners: new Map([[targetKey, [account]]]),
    verifyWritersStopped: async () => ({ buildId: 'test-build', checkedAtMs: now, challengeId: 'test-challenge', clientIds: ['test-client'] }) });
  return (await outbox.list(account))[0];
}

describe('durable HTTP sender', () => {
  it.each(['general','per-key'] as const)('joins the other tab claim during simultaneous %s recovery without another write',async action=>{
    const saved=await write();const exhaust=client(async()=>{throw Error('offline');});await exhaust.instance.connect(account);
    for(let i=0;i<8;i++){await exhaust.instance.flush();now=(await outbox.list(account))[0].nextAttemptAtMs;}exhaust.instance.stop();
    let release!:(r:Response)=>void;const mutation=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
    const first=client(mutation),second=client(mutation,undefined,{outbox:new DurableOutbox(secondDb)});
    await first.instance.connect(account);await second.instance.connect(account);
    const run=(instance:StateSync)=>action==='general'?instance.syncNow(account):instance.retryFailedKey(account,key,[saved.opId]);
    const a=run(first.instance);await vi.waitFor(()=>expect(mutation).toHaveBeenCalledTimes(1));
    const b=run(second.instance);let settled=false;void b.then(()=>{settled=true;});
    await new Promise(resolve=>setTimeout(resolve,100));expect(settled).toBe(false);expect(mutation).toHaveBeenCalledTimes(1);
    release(ack());expect(await Promise.all([a,b])).toEqual([true,true]);expect(await outbox.list(account)).toEqual([]);
    expect((await outbox.snapshot(account,key)).confirmedVersion).toBe(1);
  });

  it('bounds the wait for another tab and does not take over its live claim',async()=>{
    const saved=await write();let release!:(r:Response)=>void;
    const mutation=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
    const owner=client(mutation),follower=client(mutation,undefined,{outbox:new DurableOutbox(secondDb),timeoutMs:100});
    await owner.instance.connect(account);await follower.instance.connect(account);
    const a=owner.instance.syncNow(account);await vi.waitFor(()=>expect(mutation).toHaveBeenCalledTimes(1));
    expect(await follower.instance.syncNow(account)).toBe(false);
    expect((await outbox.list(account))[0]).toMatchObject({opId:saved.opId,status:'sending'});expect(mutation).toHaveBeenCalledTimes(1);
    release(ack());expect(await a).toBe(true);
  });

  it('cancels a cooperative wait on logout and fences the late owner response',async()=>{
    const saved=await write();let release!:(r:Response)=>void;const mutation=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
    const owner=client(mutation),follower=client(mutation,undefined,{outbox:new DurableOutbox(secondDb)});
    await owner.instance.connect(account);await follower.instance.connect(account);
    const a=owner.instance.syncNow(account);await vi.waitFor(()=>expect(mutation).toHaveBeenCalledTimes(1));
    const b=follower.instance.syncNow(account);await vi.waitFor(()=>expect(follower.fetchFn).toHaveBeenCalledTimes(2));
    await follower.instance.invalidate();expect(await b).toBe(false);release(ack());expect(await a).toBe(false);
    expect((await outbox.list(account))[0].opId).toBe(saved.opId);expect((await outbox.snapshot(account,key)).confirmedVersion).toBe(0);
  });
  it('manual sync restarts an exhausted window with fresh proof and the same payload', async () => {
    const saved=await write(); let failing=true;
    const {instance,fetchFn}=client(async()=>{if(failing)throw Error('offline');return ack();});
    await instance.connect(account);
    for(let i=0;i<8;i++){await instance.flush();now=(await outbox.list(account))[0].nextAttemptAtMs;}
    expect((await outbox.list(account))[0]).toMatchObject({opId:saved.opId,status:'failed',reason:'retry-exhausted'});
    failing=false;
    await instance.connect(account);await instance.flush();
    expect((await outbox.list(account))[0].status).toBe('failed');
    const before=fetchFn.mock.calls.length;
    expect(await instance.syncNow(account)).toBe(true);
    expect(fetchFn.mock.calls.slice(before).map(([url])=>String(url))).toEqual(['/api/me','/api/state']);
    expect(JSON.parse(String(fetchFn.mock.calls.at(-1)?.[1]?.body))).toEqual({items:[{key,value:'{"theme":"light"}',baseVersion:0}]});
    expect(await outbox.list(account)).toEqual([]);
    expect((await outbox.snapshot(account,key)).confirmedVersion).toBe(1);
  });

  it('manual retry keeps its eight-attempt bound and automatic reconnect does not reset it', async () => {
    await write();const {instance,fetchFn}=client(async()=>{throw Error('offline');});await instance.connect(account);
    for(let i=0;i<8;i++){await instance.flush();now=(await outbox.list(account))[0].nextAttemptAtMs;}
    expect(await instance.syncNow(account)).toBe(false);
    expect((await outbox.list(account))[0]).toMatchObject({status:'pending',retryCount:1});
    for(let i=1;i<8;i++){now=(await outbox.list(account))[0].nextAttemptAtMs;await instance.flush();}
    expect((await outbox.list(account))[0]).toMatchObject({status:'failed',reason:'retry-exhausted'});
    const before=fetchFn.mock.calls.length;await instance.connect(account);await instance.flush();
    expect(fetchFn.mock.calls.length).toBe(before+1);
    expect((await outbox.list(account))[0].status).toBe('failed');
  });

  it('does not reset exhausted data when fresh session verification fails', async () => {
    await write();let authorized=true;const {instance}=client(async()=>{throw Error('offline');},()=>authorized?json(proof()):json({},401));
    await instance.connect(account);
    for(let i=0;i<8;i++){await instance.flush();now=(await outbox.list(account))[0].nextAttemptAtMs;}
    const saved=await outbox.list(account);authorized=false;
    expect(await instance.syncNow(account)).toBe(false);expect(await outbox.list(account)).toEqual(saved);
  });

  it('does not reset permanent failures through the general sync button', async () => {
    await write();const {instance,fetchFn}=client(async()=>json({},400));await instance.connect(account);await instance.flush();
    const saved=await outbox.list(account);const before=fetchFn.mock.calls.length;
    expect(await instance.syncNow(account)).toBe(false);expect(await outbox.list(account)).toEqual(saved);
    expect(fetchFn.mock.calls.slice(before).map(([url])=>String(url))).toEqual(['/api/me']);
  });
  it('does not start a state write when an outbox claim finishes after beforeunload', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const saved = await write();
    const claim = outbox.claim.bind(outbox);
    let releaseClaim!: () => void;
    let claimStarted!: () => void;
    const heldClaim = new Promise<void>(resolve => { releaseClaim = resolve; });
    const started = new Promise<void>(resolve => { claimStarted = resolve; });
    vi.spyOn(outbox, 'claim').mockImplementation(async (...args) => {
      claimStarted();
      await heldClaim;
      return claim(...args);
    });
    const { instance, fetchFn } = client(async () => ack());
    instance.start(account);
    await started;
    target.dispatchEvent(new Event('beforeunload'));
    releaseClaim();
    await instance.flush();
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual(['/api/me']);
    expect((await outbox.list(account)).map(operation => ({
      opId: operation.opId, value: operation.type === 'put' ? operation.value : null,
    })))
      .toEqual([{ opId: saved.opId, value: '{"theme":"light"}' }]);
  });

  it('does not let an automatic queue flush activate or switch an account', async () => {
    const { instance, fetchFn } = client(async () => ack());
    expect(await instance.flushPending(account)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    await instance.connect(account);
    expect(await instance.flushPending('account-b')).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('flushes committed work automatically without starting another proof request', async () => {
    await write(); const { instance, fetchFn } = client(async () => ack());
    await instance.connect(account);
    expect(await instance.flushPending(account)).toBe(true);
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual(['/api/me', '/api/state']);
    expect(new Headers(fetchFn.mock.calls[1]?.[1]?.headers).get('X-FitFocus-State-Protocol')).toBe('2');
    expect(await outbox.list(account)).toEqual([]);
  });

  it('preserves an auth pause during automatic flush instead of using a timer to reauthorize', async () => {
    await write(); const { instance, fetchFn } = client(async () => json({ error: 'UNAUTH' }, 401));
    await instance.connect(account); await instance.flush();
    const operation = (await outbox.list(account))[0];
    expect((await outbox.sessionState()).active?.pause).toBe('auth');
    expect(await instance.flushPending(account)).toBe(false);
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual(['/api/me', '/api/state']);
    expect((await outbox.list(account))[0].opId).toBe(operation.opId);
    expect((await outbox.sessionState()).active?.pause).toBe('auth');
  });

  it('cannot report an automatic flush complete after its sender generation stops', async () => {
    const { instance } = client(async () => ack()); await instance.connect(account);
    const drain = outbox.isDrained.bind(outbox);
    vi.spyOn(outbox, 'isDrained').mockImplementation(async (...args) => {
      const result = await drain(...args); instance.stop(); return result;
    });
    expect(await instance.flushPending(account)).toBe(false);
  });

  it('does not let a captured profile flush switch to another account', async () => {
    const { instance, fetchFn } = client(async () => ack());
    expect(await instance.syncNow(account)).toBe(false);
    await instance.connect(account);
    expect(await instance.syncNow('account-b')).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await outbox.sessionState()).active?.accountId).toBe(account);
  });

  it('reports a requested flush complete only after fresh proof and a drained owned queue', async () => {
    await write(); const { instance, fetchFn } = client(async () => ack());
    await outbox.write({ accountId: 'account-b', writerId: 'other-editor', expectedRevision: 0, baseVersion: 0,
      intent: { type: 'put', key: 'fitfocus_data_account-b_settings', value: 'other account' } });
    await instance.connect(account);
    expect(await instance.syncNow(account)).toBe(true);
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual(['/api/me', '/api/me', '/api/state']);
    expect(await outbox.list(account)).toEqual([]);
    expect(await outbox.list('account-b')).toHaveLength(1);
  });

  it.each([401, 409])('does not report a profile flush complete after HTTP %s', async (status) => {
    await write(); const { instance } = client(async () => json({ error: status === 401 ? 'UNAUTH' : 'KV_CONFLICT' }, status));
    await instance.connect(account);
    expect(await instance.syncNow(account)).toBe(false);
    expect(await outbox.list(account)).toHaveLength(1);
  });

  it('observes a logout in another tab before reporting completion', async () => {
    const { instance } = client(async () => ack()); await instance.connect(account);
    const drain = outbox.isDrained.bind(outbox);
    vi.spyOn(outbox, 'isDrained').mockImplementation(async (...args) => {
      await new DurableOutbox(secondDb).invalidateSessions();
      return drain(...args);
    });
    expect(await instance.syncNow(account)).toBe(false);
  });

  it('rejects a late completion after the local sender was stopped', async () => {
    const { instance } = client(async () => ack()); await instance.connect(account);
    const drain = outbox.isDrained.bind(outbox);
    vi.spyOn(outbox, 'isDrained').mockImplementation(async (...args) => {
      const result = await drain(...args);
      instance.stop();
      return result;
    });
    expect(await instance.syncNow(account)).toBe(false);
  });

  it('does not report completion while a legacy source still requires verified import', async () => {
    const { instance } = client(async () => ack(), undefined, { legacyPending: () => true });
    await instance.connect(account);
    expect(await instance.syncNow(account)).toBe(false);
  });

  it('starts HTTP only after claim commit, uses scoped CAS and accepts the actual returned version', async () => {
    await write();
    const { instance } = client(async (url, init) => {
      expect((await new DurableOutbox(secondDb).list(account))[0].status).toBe('sending');
      expect(url).toBe('/api/state'); expect(init?.method).toBe('PUT');
      expect(new Headers(init?.headers).get('X-FitFocus-State-Protocol')).toBe('2');
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
      expect(new Headers(init?.headers).get('X-FitFocus-State-Protocol')).toBe('2');
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
    [426, 'STATE_PROTOCOL_REQUIRED', 'pending', 'protocol'],
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

  it.each(['scope', 'key', 'version', 'exists'] as const)('does not expose manual recovery for an unverified %s conflict snapshot', async (fault) => {
    await write();
    const { instance } = client(async () => json({ error: 'KV_CONFLICT', key: fault === 'key' ? 'other-key' : key,
      value: 'remote', exists: fault === 'exists' ? 'yes' : true, version: fault === 'version' ? -1 : 9 }, 409,
    fault === 'scope' ? {} : scope));
    await instance.connect(account); await instance.flush();
    expect((await outbox.list(account))[0]).toMatchObject({ status: 'pending', retryCount: 0 });
    expect((await outbox.list(account))[0]).not.toHaveProperty('serverSnapshot');
    expect((await outbox.sessionState()).active?.pause).toBe('protocol');
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

  it('does not resend an auth-paused intent until syncNow obtains a fresh proof', async () => {
    const operation = await write();
    const { instance, fetchFn } = client(async () => json({ error: 'UNAUTH' }, 401));
    await instance.connect(account); await instance.flush();
    expect((await outbox.sessionState()).active?.pause).toBe('auth');
    await instance.flush(); await instance.flush();
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/state']);

    expect(await instance.syncNow(account)).toBe(false);
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/state', '/api/me', '/api/state']);
    expect((await outbox.sessionState()).active?.pause).toBe('auth');
    expect(await outbox.list(account)).toMatchObject([{ opId: operation.opId, status: 'pending', retryCount: 0, baseVersion: 0 }]);
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

  it('publishes the new guard when a paused same-server session is verified again', async () => {
    const { instance } = client(async () => ack());
    const guards: Array<{ accountId: string; serverSessionId: string; sessionEpoch: string; authFence: number }> = [];
    const unsubscribe = instance.subscribeReadGuard(guard => guards.push(guard));
    await instance.connect(account);
    const original = guards[0];
    expect(original).toMatchObject({ accountId: account, serverSessionId: sessionId });

    const connection = await db.open();
    const tx = connection.transaction(STATE_STORES.meta, 'readwrite');
    const store = tx.objectStore(STATE_STORES.meta);
    const activeRequest = store.get('active-session');
    activeRequest.onsuccess = () => store.put({ ...activeRequest.result, pause: 'auth' });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Could not pause active session'));
    });

    expect(await instance.syncNow(account)).toBe(true);
    expect(guards).toHaveLength(2);
    expect(guards[1]).toMatchObject({ accountId: account, serverSessionId: sessionId });
    expect(guards[1].sessionEpoch).not.toBe(original.sessionEpoch);
    expect(guards[1].authFence).toBeGreaterThan(original.authFence);
    unsubscribe();
  });

  it('reads a scoped current server snapshot before rebasing an imported intent', async () => {
    const legacy = await importLegacyConflict();
    const bodies: Array<{ method: string; body?: unknown }> = [];
    const { instance } = client(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.startsWith('/api/state?')) return json({ items: [{ key, value: 'verified remote value', version: 7, exists: true }] }, 200, scope);
      if (url === '/api/state' && method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as { items: Array<{ baseVersion: number }> };
        bodies.push({ method, body });
        return json({ ok: true, items: [{ key, version: 8, exists: true }] }, 200, scope);
      }
      return json({ error: 'UNEXPECTED_REQUEST' }, 500, scope);
    });
    await instance.connect(account);

    expect(await instance.resolveLegacyConflictedKey(account, key, [legacy.opId], 'keep-latest-local')).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].body).toMatchObject({ items: [{ key, value: '{"theme":"light"}', baseVersion: 7 }] });
    expect(await outbox.list(account)).toEqual([]);
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toMatchObject({ kind: 'keep-latest-local', serverVersion: 7 });
  });

  it.each(['missing-scope', 'wrong-session', 'invalid-version'] as const)('does not resolve imported intent with %s server proof', async (fault) => {
    const legacy = await importLegacyConflict();
    const headers = fault === 'missing-scope' ? {} : fault === 'wrong-session' ? { ...scope, 'X-FitFocus-State-Session': 'c'.repeat(64) } : scope;
    const { instance } = client(async (input) => String(input).startsWith('/api/state?')
      ? json({ items: [{ key, value: 'remote', version: fault === 'invalid-version' ? -1 : 7, exists: true }] }, 200, headers)
      : ack());
    await instance.connect(account);

    expect(await instance.resolveLegacyConflictedKey(account, key, [legacy.opId], 'keep-latest-local')).toBe(false);
    expect(await outbox.list(account)).toEqual([expect.objectContaining({ opId: legacy.opId, status: 'conflicted', baseVersion: 0 })]);
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toBeUndefined();
  });

  it('resolves a legacy profile only through the guarded profile endpoint and keeps its typed sender', async () => {
    const profileKey = `fitfocus_data_${account}_profile`;
    const localProfile = userProfile(account, { name: 'Локальный профиль', version: 1 });
    const remoteProfile = userProfile(account, { name: 'Серверный профиль', version: 9 });
    const localValue = JSON.stringify(localProfile);
    const legacy = await importLegacyConflict(profileKey, localValue);
    const profileScope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
      'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId };
    const methods: string[] = [];
    const { instance } = client(async (input, init) => {
      const url = String(input), method = init?.method ?? 'GET';
      if (url === '/api/profile' && method === 'GET') {
        methods.push('GET profile');
        return json({ profile: remoteProfile }, 200, profileScope);
      }
      if (url === '/api/profile' && method === 'PUT') {
        methods.push('PUT profile');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({ ...localProfile, baseVersion: 9 });
        expect(await outbox.list(account)).toMatchObject([{ resource: 'profile', status: 'sending', baseVersion: 9 }]);
        return json({ profile: { ...localProfile, version: 10 }, version: 10 }, 200, profileScope);
      }
      return json({ error: 'UNEXPECTED_REQUEST' }, 500, profileScope);
    }, () => json({ ...proof(), profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } }));
    await instance.connect(account);

    expect(await instance.resolveLegacyConflictedKey(account, profileKey, [legacy.opId], 'keep-latest-local')).toBe(true);
    expect(methods).toEqual(['GET profile', 'PUT profile']);
    expect(await outbox.list(account)).toEqual([]);
    expect(await outbox.snapshot(account, profileKey)).toMatchObject({ value: localValue, confirmedVersion: 10 });
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toMatchObject({ kind: 'keep-latest-local', serverVersion: 9 });
  });

  it('keeps a legacy profile resolution valid while another proof is in flight', async () => {
    const profileKey = `fitfocus_data_${account}_profile`;
    const localProfile = userProfile(account, { name: 'Локальный профиль', version: 1 });
    const remoteProfile = userProfile(account, { name: 'Серверный профиль', version: 9 });
    const legacy = await importLegacyConflict(profileKey, JSON.stringify(localProfile));
    const profileScope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
      'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId };
    let instance!: StateSync;
    let meCalls = 0;
    let resolveHeldProof!: (response: Response) => void;
    let notifyHeldProofStarted!: () => void;
    const heldProofStarted = new Promise<void>((resolve) => { notifyHeldProofStarted = resolve; });
    let concurrentProof: Promise<boolean> | undefined;
    const methods: string[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input), method = init?.method ?? 'GET';
      if (url === '/api/me') {
        meCalls += 1;
        if (meCalls === 3) {
          notifyHeldProofStarted();
          return new Promise<Response>((resolve) => { resolveHeldProof = resolve; });
        }
        return json({ ...proof(), profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } });
      }
      if (url === '/api/profile' && method === 'GET') {
        methods.push('GET profile');
        concurrentProof = instance.syncNow(account);
        await heldProofStarted;
        return json({ profile: remoteProfile }, 200, profileScope);
      }
      if (url === '/api/profile' && method === 'PUT') {
        methods.push('PUT profile');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({ ...localProfile, baseVersion: 9 });
        return json({ profile: { ...localProfile, version: 10 }, version: 10 }, 200, profileScope);
      }
      return json({ error: 'UNEXPECTED_REQUEST' }, 500, profileScope);
    });
    instance = new StateSync({ outbox, fetchImpl: fetchFn, now: () => now, random: () => 0.5, legacyPending: () => false });
    clients.push(instance);
    await instance.connect(account);

    expect(await instance.resolveLegacyConflictedKey(account, profileKey, [legacy.opId], 'keep-latest-local')).toBe(true);
    expect(methods).toEqual(['GET profile']);
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toMatchObject({ kind: 'keep-latest-local', serverVersion: 9 });

    resolveHeldProof(json({ ...proof(), profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } }));
    expect(await concurrentProof).toBe(true);
    expect(methods).toEqual(['GET profile', 'PUT profile']);
    expect(await outbox.list(account)).toEqual([]);
  });

  it('rejects legacy profile resolution if a concurrent proof changes the active session', async () => {
    const profileKey = `fitfocus_data_${account}_profile`;
    const localProfile = userProfile(account, { name: 'Локальный профиль', version: 1 });
    const remoteProfile = userProfile(account, { name: 'Серверный профиль', version: 9 });
    const legacy = await importLegacyConflict(profileKey, JSON.stringify(localProfile));
    const profileScope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
      'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId };
    let instance!: StateSync;
    let meCalls = 0;
    let concurrentProof: Promise<boolean> | undefined;
    const methods: string[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input), method = init?.method ?? 'GET';
      if (url === '/api/me') {
        meCalls += 1;
        const session = meCalls === 3 ? 'b'.repeat(64) : sessionId;
        return json({ ...proof(account, session), profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } });
      }
      if (url === '/api/profile' && method === 'GET') {
        methods.push('GET profile');
        concurrentProof = instance.syncNow(account);
        expect(await concurrentProof).toBe(false);
        return json({ profile: remoteProfile }, 200, profileScope);
      }
      if (url === '/api/profile' && method === 'PUT') {
        methods.push('PUT profile');
        return json({ profile: { ...localProfile, version: 10 }, version: 10 }, 200, profileScope);
      }
      return json({ error: 'UNEXPECTED_REQUEST' }, 500, profileScope);
    });
    instance = new StateSync({ outbox, fetchImpl: fetchFn, now: () => now, random: () => 0.5, legacyPending: () => false });
    clients.push(instance);
    await instance.connect(account);
    const resolveOutbox = vi.spyOn(outbox, 'resolveLegacyConflictGroup');

    expect(await instance.resolveLegacyConflictedKey(account, profileKey, [legacy.opId], 'keep-latest-local')).toBe(false);
    expect(methods).toEqual(['GET profile']);
    expect(resolveOutbox).toHaveBeenCalledTimes(1);
    expect(await outbox.list(account)).toEqual([expect.objectContaining({ opId: legacy.opId, status: 'conflicted' })]);
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toBeUndefined();
  });

  it('accepts a guarded server profile snapshot without sending the legacy local value', async () => {
    const profileKey = `fitfocus_data_${account}_profile`;
    const localProfile = userProfile(account, { name: 'Локальный профиль', version: 1 });
    const remoteProfile = userProfile(account, { name: 'Серверный профиль', version: 9 });
    const legacy = await importLegacyConflict(profileKey, JSON.stringify(localProfile));
    const profileScope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
      'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId };
    const profileMethods: string[] = [];
    const { instance } = client(async (input, init) => {
      if (String(input) === '/api/profile') {
        profileMethods.push(init?.method ?? 'GET');
        return json({ profile: remoteProfile }, 200, profileScope);
      }
      return json({ error: 'UNEXPECTED_REQUEST' }, 500, profileScope);
    }, () => json({ ...proof(), profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } }));
    await instance.connect(account);

    expect(await instance.resolveLegacyConflictedKey(account, profileKey, [legacy.opId], 'accept-server')).toBe(true);
    expect(profileMethods).toEqual(['GET']);
    expect(await outbox.list(account)).toEqual([]);
    expect(await outbox.snapshot(account, profileKey)).toMatchObject({ value: JSON.stringify(remoteProfile), confirmedVersion: 9 });
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toMatchObject({ kind: 'accept-server', serverVersion: 9 });
    expect(receipt.resolution).not.toHaveProperty('replacementOpId');
  });

  it.each(['missing-scope', 'wrong-account', 'invalid-version'] as const)('does not resolve a legacy profile with %s proof', async (fault) => {
    const profileKey = `fitfocus_data_${account}_profile`;
    const localProfile = userProfile(account, { name: 'Локальный профиль', version: 1 });
    const legacy = await importLegacyConflict(profileKey, JSON.stringify(localProfile));
    const validProfile = userProfile(fault === 'wrong-account' ? 'account-b' : account,
      { name: 'Серверный профиль', version: fault === 'invalid-version' ? 0 : 9 });
    const profileScope = { 'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
      'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sessionId };
    const headers = fault === 'missing-scope' ? {} : profileScope;
    const { instance } = client(async (input) => String(input) === '/api/profile'
      ? json({ profile: validProfile }, 200, headers)
      : json({ error: 'UNEXPECTED_REQUEST' }, 500, profileScope),
    () => json({ ...proof(), profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } }));
    await instance.connect(account);

    expect(await instance.resolveLegacyConflictedKey(account, profileKey, [legacy.opId], 'keep-latest-local')).toBe(false);
    expect(await outbox.list(account)).toEqual([expect.objectContaining({ opId: legacy.opId, status: 'conflicted' })]);
    const [receipt] = await stateTransaction(await db.open(), [STATE_STORES.migrationItems], 'readonly', (tx) =>
      indexedRequest(tx.objectStore(STATE_STORES.migrationItems).getAll())) as MigrationItem[];
    expect(receipt.resolution).toBeUndefined();
  });
});
