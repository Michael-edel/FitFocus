import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DurableOutbox, type OutboxReadGuard } from '../storage/durableOutbox';
import { StateDatabase } from '../storage/stateDatabase';
import { readScopedJson } from '../storage/sessionRead';
import { prepareAchievementSession } from '../services/achievementSession';
import { prepareHuaweiSession } from '../services/huaweiSession';
import { listenForPageExit } from '../storage/sessionTransport';

const account = 'page-exit-owner', sid = 'a'.repeat(64);
let database: StateDatabase, outbox: DurableOutbox, guard: OutboxReadGuard;

beforeEach(async () => {
  database = new StateDatabase({ factory: new IDBFactory() });
  outbox = new DurableOutbox(database);
  guard = (await outbox.acceptReadSession(account, sid, 0))!;
});
afterEach(() => { database.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['state', 'achievements', 'huawei'] as const)(
  'does not begin a %s read after pagehide during the initial IDB assertion', async kind => {
    const events: string[] = ['attempt-start'];
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const abort = AbortController.prototype.abort;
    vi.spyOn(AbortController.prototype, 'abort').mockImplementation(function (this: AbortController, reason?: unknown) {
      events.push('abort'); abort.call(this, reason);
    });
    const addListener = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, callback, options) => {
      if (type === 'beforeunload' || type === 'pagehide') events.push(`listen:${type}`);
      addListener(type, callback, options);
    });
    let assertionStarted!: () => void, releaseAssertion!: () => void;
    const started = new Promise<void>(resolve => { assertionStarted = resolve; });
    const held = new Promise<boolean>(resolve => { releaseAssertion = () => resolve(true); });
    vi.spyOn(outbox, 'isReadSessionCurrent').mockImplementationOnce(() => {
      events.push('assertion-held'); assertionStarted(); return held;
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      events.push('fetch');
      return new Response(JSON.stringify({ user: { sub: account }, hasAccess: true,
        stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: sid },
        achievementSync: { protocol: 1, guard: 1 }, huaweiSync: { protocol: 1, guard: 1 }, items: [] }), {
        headers: { 'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
          'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': sid },
      });
    });
    const controller = new AbortController();
    controller.signal.addEventListener('abort', () => events.push('abort'));
    const attempt = kind === 'state'
      ? readScopedJson('/api/state', guard, 'state', { outbox, fetchImpl })
      : kind === 'achievements'
        ? prepareAchievementSession(guard, controller, () => true, { outbox, fetchImpl })
        : prepareHuaweiSession(guard, controller, () => true, { outbox, fetchImpl });
    const completed = attempt.then(() => { events.push('complete:success'); }, () => { events.push('complete:cancelled'); });
    await started;
    events.push('pagehide');
    target.dispatchEvent(new Event('pagehide'));
    releaseAssertion();
    await completed;

    expect(events.indexOf('listen:pagehide')).toBeLessThan(events.indexOf('pagehide'));
    expect(events, `read lifecycle: ${events.join(' → ')}`).toContain('abort');
    expect(events, `read lifecycle: ${events.join(' → ')}`).toContain('complete:cancelled');
    expect(events, `read lifecycle: ${events.join(' → ')}`).not.toContain('fetch');
  },
);

it('permits new guarded reads after a persisted pageshow restores the document', () => {
  const target = new EventTarget();
  let first = 0, late = 0, restored = 0;
  listenForPageExit(() => { first += 1; }, target);
  target.dispatchEvent(new Event('pagehide'));
  expect(first).toBe(1);
  listenForPageExit(() => { late += 1; }, target);
  expect(late).toBe(1);
  const pageshow = new Event('pageshow');
  Object.defineProperty(pageshow, 'persisted', { value: true });
  target.dispatchEvent(pageshow);
  listenForPageExit(() => { restored += 1; }, target);
  expect(restored).toBe(0);
  target.dispatchEvent(new Event('pagehide'));
  expect(restored).toBe(1);
});

it('does not latch a canceled beforeunload as a page exit', () => {
  const target = new EventTarget();
  let active = 0, next = 0;
  const stop = listenForPageExit(() => { active += 1; }, target);
  target.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  expect(active).toBe(1);
  stop();
  listenForPageExit(() => { next += 1; }, target);
  expect(next).toBe(0);
  target.dispatchEvent(new Event('pagehide'));
  expect(next).toBe(1);
});
