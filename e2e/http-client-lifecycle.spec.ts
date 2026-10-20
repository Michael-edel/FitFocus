import { expect } from '@playwright/test';
import { resolve } from 'node:path';
import { test } from './support/mockTest';
import { mockApp, openApp } from './support/appHarness';
import { startPwaReleaseServer } from './support/pwaReleaseServer';

const marker = '__e2e_http_client_unload__';

test('navigation aborts the held public environment request before unloading', async ({ page }) => {
  await page.addInitScript((markerKey) => {
    const mark = (suffix: string, value: string) => {
      try { localStorage.setItem(`${markerKey}:${suffix}`, value); } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/env') {
        mark('request', 'started');
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const abort = () => {
            mark('signal', 'aborted');
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
      }
      return originalFetch(input, init);
    };
    window.addEventListener('beforeunload', () => mark('beforeunload', 'fired'));
  }, marker);

  await mockApp(page, { session: 'auth' });
  await page.route('**/__e2e_http_client_unload_probe__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><title>Unload probe</title></head><body>Unload probe</body></html>',
  }));

  await openApp(page, '/');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}:request`), marker)).toBe('started');

  const appOrigin = await page.evaluate(() => location.origin);
  await page.goto(`${appOrigin}/__e2e_http_client_unload_probe__`);
  await expect(page).toHaveTitle('Unload probe');
  await expect.poll(() => page.evaluate(key => ({
    request: localStorage.getItem(`${key}:request`),
    signal: localStorage.getItem(`${key}:signal`),
    beforeunload: localStorage.getItem(`${key}:beforeunload`),
  }), marker)).toEqual({ request: 'started', signal: 'aborted', beforeunload: 'fired' });
});

test('a synthetic BFCache restore restarts the public environment request after page-exit cancellation', async ({ page }) => {
  const restoreMarker = '__e2e_http_client_bfcache_restore__';
  await page.addInitScript((markerKey) => {
    const record = (value: string) => {
      try {
        const events = JSON.parse(localStorage.getItem(markerKey) || '[]') as string[];
        events.push(value);
        localStorage.setItem(markerKey, JSON.stringify(events));
      } catch { /* The document may be unloading. */ }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/env') {
        const events = JSON.parse(localStorage.getItem(markerKey) || '[]') as string[];
        const requestNumber = events.filter(value => value.startsWith('request:')).length + 1;
        record(`request:${requestNumber}`);
        if (requestNumber === 1) {
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            const abort = () => {
              record('abort:1');
              reject(new DOMException('Aborted', 'AbortError'));
            };
            if (signal?.aborted) abort();
            else signal?.addEventListener('abort', abort, { once: true });
          });
        }
        return originalFetch(input, init).then(response => {
          record(`response:${requestNumber}:${response.status}`);
          return response;
        });
      }
      return originalFetch(input, init);
    };
  }, restoreMarker);

  await mockApp(page, { session: 'auth' });
  await openApp(page, '/');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), restoreMarker))
    .toContain('request:1');

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), restoreMarker))
    .toContain('abort:1');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), restoreMarker))
    .toContain('response:2:200');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), restoreMarker))
    .toEqual(['request:1', 'abort:1', 'request:2', 'response:2:200']);
});

test('a real browser BFCache restore reloads public environment configuration', async ({ browser }) => {
  test.skip(test.info().project.name !== 'desktop-chromium-bfcache', 'Run the native BFCache acceptance in Chromium only.');

  const bfcacheMarker = '__e2e_http_client_real_bfcache__';
  const probePath = '/__e2e_actual_bfcache_probe__';
  const server = await startPwaReleaseServer(resolve('dist'), resolve('dist'), {
    unauthenticated: true,
    cacheControl: 'public, max-age=60',
    bfcacheProbePath: probePath,
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const cacheMisses: unknown[] = [];
  try {
    await cdp.send('Page.enable');
    cdp.on('Page.backForwardCacheNotUsed', event => cacheMisses.push(event));
    await page.addInitScript((markerKey) => {
      type State = { events: string[]; envRequestsStarted: number; envRequestsFinished: number; beforeUnloadListeners: number };
      const read = (): State => {
        try {
          const parsed = JSON.parse(localStorage.getItem(markerKey) || '{}') as Partial<State>;
          return {
            events: Array.isArray(parsed.events) ? parsed.events : [],
            envRequestsStarted: typeof parsed.envRequestsStarted === 'number' ? parsed.envRequestsStarted : 0,
            envRequestsFinished: typeof parsed.envRequestsFinished === 'number' ? parsed.envRequestsFinished : 0,
            beforeUnloadListeners: typeof parsed.beforeUnloadListeners === 'number' ? parsed.beforeUnloadListeners : 0,
          };
        } catch {
          return { events: [], envRequestsStarted: 0, envRequestsFinished: 0, beforeUnloadListeners: 0 };
        }
      };
      const update = (apply: (state: State) => State) => {
        try { localStorage.setItem(markerKey, JSON.stringify(apply(read()))); } catch { /* The document may be unloading. */ }
      };
      const trackedBeforeUnload = new Set<EventListenerOrEventListenerObject>();
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (this === window && type === 'beforeunload' && listener) {
          trackedBeforeUnload.add(listener);
          update(state => ({ ...state, beforeUnloadListeners: trackedBeforeUnload.size }));
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
      EventTarget.prototype.removeEventListener = function (type, listener, options) {
        if (this === window && type === 'beforeunload' && listener) {
          trackedBeforeUnload.delete(listener);
          update(state => ({ ...state, beforeUnloadListeners: trackedBeforeUnload.size }));
        }
        return originalRemoveEventListener.call(this, type, listener, options);
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : String(input), location.href);
        const tracksEnvironment = url.pathname === '/api/env';
        if (tracksEnvironment) update(state => ({ ...state, envRequestsStarted: state.envRequestsStarted + 1 }));
        try {
          return await originalFetch(input, init);
        } finally {
          if (tracksEnvironment) update(state => ({ ...state, envRequestsFinished: state.envRequestsFinished + 1 }));
        }
      };
      window.addEventListener('pagehide', event => {
        update(state => ({ ...state, events: [...state.events, `pagehide:${(event as PageTransitionEvent).persisted}`] }));
      });
      window.addEventListener('pageshow', event => {
        update(state => ({ ...state, events: [...state.events, `pageshow:${(event as PageTransitionEvent).persisted}`] }));
      });
    }, bfcacheMarker);

    // Prove that this browser run can store and restore an eligible same-origin document.
    await page.goto(`${server.origin}${probePath}?first=1`, { waitUntil: 'domcontentloaded' });
    await page.goto(`${server.origin}${probePath}?second=1`, { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'commit' });
    const probeEvents = await page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key) || '{}') as { events?: string[] };
      return state.events ?? [];
    }, bfcacheMarker);
    if (!probeEvents.includes('pageshow:true')) {
      console.log('Plain BFCache probe miss', JSON.stringify(cacheMisses));
    }
    await expect.poll(() => page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key) || '{}') as { events?: string[] };
      return state.events ?? [];
    }, bfcacheMarker), { timeout: 1_000 }).toContain('pageshow:true');
    await page.evaluate(key => localStorage.removeItem(key), bfcacheMarker);

    await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/FitFocus/i);
    await page.waitForLoadState('networkidle');
    await expect.poll(() => page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key) || '{}') as {
        envRequestsStarted?: number; envRequestsFinished?: number; beforeUnloadListeners?: number;
      };
      return state.envRequestsStarted > 0 && state.envRequestsStarted === state.envRequestsFinished;
    }, bfcacheMarker)).toBe(true);
    const beforeNavigation = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}') as {
      envRequestsStarted: number; envRequestsFinished: number; beforeUnloadListeners: number;
    }, bfcacheMarker);
    expect(beforeNavigation.beforeUnloadListeners).toBe(0);

    await page.goto(`${server.origin}${probePath}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('BFCache probe');
    await expect.poll(() => page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key) || '{}') as { events?: string[] };
      return state.events ?? [];
    }, bfcacheMarker), { timeout: 5_000 }).toContain('pagehide:true');

    await page.goBack({ waitUntil: 'commit' });
    await expect(page).toHaveTitle(/FitFocus/i);
    await expect.poll(() => page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key) || '{}') as {
        events?: string[]; envRequestsStarted?: number; envRequestsFinished?: number;
      };
      return {
        restoredFromBfcache: state.events?.includes('pageshow:true') ?? false,
        envRequestsStarted: state.envRequestsStarted,
        envRequestsFinished: state.envRequestsFinished,
      };
    }, bfcacheMarker)).toEqual({
      restoredFromBfcache: true,
      envRequestsStarted: beforeNavigation.envRequestsStarted + 1,
      envRequestsFinished: beforeNavigation.envRequestsFinished + 1,
    });
  } finally {
    await context.close();
    await server.close();
  }
});
