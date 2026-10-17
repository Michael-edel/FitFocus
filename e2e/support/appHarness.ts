import { expect, type Page } from '@playwright/test';

type MockSessionMode = 'auth' | 'register' | 'app';

type PushMockConfig = {
  configured?: boolean;
  supported?: boolean;
  standalone?: boolean;
  permission?: 'granted' | 'default' | 'denied';
  preSubscribed?: boolean;
};

type MockAppOptions = {
  session: MockSessionMode;
  push?: PushMockConfig;
  /** Acknowledge incidental state writes when a test exercises another guarded API. */
  acknowledgeStateWrites?: boolean;
  /** Return a scoped conflict for DELETE /api/state while exercising durable recovery. */
  stateDeleteConflict?: { version: number; exists: boolean; value: string };
  /** Update/precache tests must retain the browser's actual SW objects. */
  realServiceWorker?: boolean;
  /** Native SW flows serve API fixtures over HTTP, including worker-originated requests. */
  nativeApi?: boolean;
};

const AUTH_PENDING_STORAGE_KEY = 'fitfocus.auth.pending-oauth.v1';

const defaultAiPlan = {
  title: 'E2E plan',
  strategySummary: 'Тестовый AI-план для production E2E.',
  weeklyFocus: 'Стабильный режим',
  dailyKpi: {
    calories: 1800,
    protein: 120,
    fat: 60,
    carbs: 180,
  },
  rules: ['Не пропускать завтрак', 'Следить за водой'],
  firstTasks: ['Записать первый завтрак', 'Проверить настройки push', 'Открыть план'],
  mealTemplate: {
    breakfast: 'Овсянка 250 г',
    lunch: 'Курица 180 г + рис 150 г',
    dinner: 'Рыба 180 г + овощи',
    snack: 'Йогурт 200 г',
  },
  createdAt: '2026-06-27T00:00:00.000Z',
  model: 'e2e-mock',
};

export function buildMockProfile() {
  return {
    id: 'google-e2e-sub',
    version: 1,
    name: 'E2E User',
    email: 'e2e@example.com',
    googleSub: 'google-e2e-sub',
    picture: '',
    gender: 'MALE',
    weight: 72,
    height: 176,
    age: 31,
    activityLevel: 1.55,
    goal: 'LOSS',
    targetWeight: 68,
    adaptationMultiplier: 1,
    familyMembers: [],
    exclusions: '',
    measurementsHistory: [
      {
        date: '2026-06-27T00:00:00.000Z',
        weight: 72,
      },
    ],
    weightHistory: [
      {
        date: '2026-06-27',
        weight: 72,
      },
    ],
    progressPhotos: [],
    tasks: [],
    plan: 'free',
    onboardingVersion: 2,
    profileDetailsCompleted: false,
    wearableEnabled: false,
    aiPlan: defaultAiPlan,
  };
}

export async function mockApp(page: Page, options: MockAppOptions): Promise<void> {
  const profile = buildMockProfile();

  if (options.session === 'register') {
    await page.addInitScript((key: string) => {
      window.sessionStorage.setItem(key, '1');
    }, AUTH_PENDING_STORAGE_KEY);
  }

  const push = {
    configured: true,
    supported: true,
    standalone: false,
    permission: 'granted' as const,
    preSubscribed: true,
    ...options.push,
  };

  if (!options.realServiceWorker && (options.session === 'app' || options.session === 'register')) {
    await installPushMocks(page, push);
  } else if (push.standalone) {
    await installStandaloneModeMock(page, true);
  }

  if (options.nativeApi) return;
  // Capture the emulated browser before app navigation. Evaluating the page from
  // a route handler can race reloads and destroy the navigation context.
  const currentBrowserLabel = await page.evaluate(() => {
    const ua = navigator.userAgent;
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Edg/i.test(ua)) return 'Edge';
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    return 'Браузер';
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();

    const json = async (payload: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: path.startsWith('/api/push/') && request.headers()['x-fitfocus-state-account'] ? {
        'X-FitFocus-Push-Protocol': '1', 'X-FitFocus-Push-Guard': '1',
        'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'],
        'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'],
      } : path === '/api/ai' && method === 'POST' && request.headers()['x-fitfocus-state-account'] ? {
        'X-FitFocus-AI-Protocol': '1', 'X-FitFocus-AI-Guard': '1',
        'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'],
        'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'],
      } : path.startsWith('/api/wearable/huawei') && request.headers()['x-fitfocus-state-account'] ? {
        'X-FitFocus-Huawei-Protocol': '1', 'X-FitFocus-Huawei-Guard': '1',
        'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'],
        'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'],
      } : path.startsWith('/api/achievements') ? {
        'X-FitFocus-Achievements-Protocol': '1', 'X-FitFocus-Achievements-Guard': '1',
        'X-FitFocus-State-Account': 'google-e2e-sub', 'X-FitFocus-State-Session': 'a'.repeat(64),
      } : path === '/api/bootstrap' || path === '/api/state' && method === 'GET' ? {
        [path === '/api/bootstrap' ? 'X-FitFocus-Bootstrap-Protocol' : 'X-FitFocus-State-Protocol']: path === '/api/bootstrap' ? '1' : '2',
        [path === '/api/bootstrap' ? 'X-FitFocus-Bootstrap-Guard' : 'X-FitFocus-State-Guard']: '1',
        'X-FitFocus-State-Account': 'google-e2e-sub', 'X-FitFocus-State-Session': 'a'.repeat(64),
      } : path === '/api/state'
        && (options.acknowledgeStateWrites || (method === 'DELETE' && !!options.stateDeleteConflict))
        && ['PUT', 'DELETE'].includes(method)
        && request.headers()['x-fitfocus-state-account'] ? {
        'X-FitFocus-State-Protocol': '2', 'X-FitFocus-State-Guard': '1',
        'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'],
        'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'],
      } : path === '/api/profile' && method === 'PUT' && options.acknowledgeStateWrites
        && request.headers()['x-fitfocus-state-account'] ? {
        'X-FitFocus-Profile-Protocol': '1', 'X-FitFocus-Profile-Guard': '1',
        'X-FitFocus-State-Account': request.headers()['x-fitfocus-state-account'],
        'X-FitFocus-State-Session': request.headers()['x-fitfocus-state-session'],
      } : {},
      body: JSON.stringify(payload),
    });

    if (path === '/api/env' && method === 'GET') {
      await json({ requireInvite: false });
      return;
    }

    if (path === '/api/me' && method === 'GET') {
      if (options.session === 'auth') {
        await json({ user: null, hasAccess: true });
        return;
      }
      await json({
        user: {
          sub: 'google-e2e-sub',
          email: 'e2e@example.com',
          name: 'E2E User',
          picture: '',
          roles: ['user'],
        },
        hasAccess: true,
        stateSync: { protocol: 2, guard: 1, accountId: 'google-e2e-sub', sessionId: 'a'.repeat(64) },
        bootstrapSync: { protocol: 1, guard: 1 },
        ...(options.acknowledgeStateWrites
          ? { profileSync: { protocol: 1, guard: 1, weeklyMenuProjection: 1 } }
          : {}),
        aiSync: { protocol: 1, guard: 1 },
        weeklyMenuSync: { protocol: 1, guard: 1 },
        achievementSync: { protocol: 1, guard: 1 },
        huaweiSync: { protocol: 1, guard: 1 },
        pushSync: { protocol: 1, guard: 1 },
      });
      return;
    }

    if (path === '/api/bootstrap' && method === 'GET') {
      if (options.session === 'app') {
        await json({ user: { sub: 'google-e2e-sub' }, profile, items: [] });
        return;
      }
      await json({ user: { sub: 'google-e2e-sub' }, profile: null, items: [] });
      return;
    }

    if (path === '/api/achievements' || path === '/api/achievements/check') {
      await json({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [] }); return;
    }
    if (path === '/api/wearable/huawei/status' && method === 'GET') {
      await json({ configured: false, connected: false, status: 'disconnected', scope: '', expiresAt: null, lastSyncAt: null }); return;
    }
    if (path === '/api/state' && method === 'GET') { await json({ items: [] }); return; }
    if (path === '/api/state' && method === 'DELETE' && options.stateDeleteConflict) {
      await json({ error: 'KV_CONFLICT', key: url.searchParams.get('key'), ...options.stateDeleteConflict }, 409);
      return;
    }
    // Default mocks retain outgoing intents via protocol pause; verified writer tests install their own acknowledgements.

    if (path === '/api/profile' && method === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown> | null;
      const baseVersion = Number(body?.baseVersion);
      const version = Number.isSafeInteger(baseVersion) && baseVersion >= 0 ? baseVersion + 1 : profile.version + 1;
      await json({
        profile: {
          ...profile,
          ...(body || {}),
          googleSub: 'google-e2e-sub',
          email: 'e2e@example.com',
          aiPlan: defaultAiPlan,
          ...(options.acknowledgeStateWrites ? { version } : {}),
        },
        ...(options.acknowledgeStateWrites ? { version } : {}),
      });
      return;
    }

    if (path === '/api/state' && options.acknowledgeStateWrites && (method === 'PUT' || method === 'DELETE')) {
      const payload = request.postDataJSON() as { items?: Array<{ key?: unknown; baseVersion?: unknown }> } | null;
      const items = Array.isArray(payload?.items) ? payload.items : [{
        key: url.searchParams.get('key'),
        baseVersion: Number(url.searchParams.get('baseVersion')),
      }];
      const item = items[0];
      const version = Number(item?.baseVersion ?? 0) + 1;
      if (method === 'DELETE') {
        await json({ ok: true, key: String(item?.key ?? ''), version, exists: false });
      } else {
        await json({ ok: true, items: items.map((current) => ({
          key: String(current.key ?? ''),
          version: Number(current.baseVersion ?? 0) + 1,
          exists: true,
        })) });
      }
      return;
    }

    if (path === '/api/ai' && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown> | null;
      if (body?.feature === 'wis_text') {
        await json({ text: 'E2E: питание и прогресс остаются в пределах персонального плана.' });
        return;
      }
    }

    if (path === '/api/push/status' && method === 'GET') {
      const currentSubscriptionId = push.supported && push.preSubscribed ? 'sub-e2e-1' : null;
      await json({
        configured: push.configured,
        vapid_public_key: push.configured ? 'BEl6eA3k0t7K8U3d5j4LmE2E2mockPublicKeyForPlaywright12345' : '',
        current_subscription_id: currentSubscriptionId,
        current_browser_label: currentBrowserLabel,
        count: currentSubscriptionId ? 1 : 0,
        subscriptions: currentSubscriptionId
          ? [{ id: currentSubscriptionId, device_label: null, user_agent: '', last_error: null }]
          : [],
      });
      return;
    }

    if (path === '/api/push/subscribe' && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown> | null;
      await json({
        ok: true,
        deviceLabel: String(body?.deviceLabel || 'Браузер'),
      });
      return;
    }

    if (path === '/api/push/unsubscribe' && method === 'POST') {
      await json({ ok: true });
      return;
    }

    if (path === '/api/push/test' && method === 'POST') {
      await json({
        sent: push.supported && push.preSubscribed ? 1 : 0,
        failed: 0,
        removed: 0,
        failures: [],
      });
      return;
    }

    if (path === '/api/logout' && method === 'POST') {
      await json({ ok: true });
      return;
    }

    await json({ ok: true });
  });
}

async function installStandaloneModeMock(page: Page, standalone: boolean): Promise<void> {
  await page.addInitScript(({ standaloneMode }) => {
    const originalMatchMedia = window.matchMedia.bind(window);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => {
        if (query === '(display-mode: standalone)') {
          return {
            matches: standaloneMode,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          };
        }
        return originalMatchMedia(query);
      },
    });

    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => standaloneMode,
    });
  }, { standaloneMode: standalone });
}

async function installPushMocks(page: Page, config: Required<PushMockConfig>): Promise<void> {
  await page.addInitScript(({ options }) => {
    let permission = options.permission;
    let subscribed = options.preSubscribed;

    class MockPushSubscription {
      endpoint: string;
      expirationTime: null;
      options: { applicationServerKey: null; userVisibleOnly: true };

      constructor() {
        this.endpoint = 'https://push.example.test/sub-e2e-1';
        this.expirationTime = null;
        this.options = { applicationServerKey: null, userVisibleOnly: true };
      }

      async unsubscribe() {
        subscribed = false;
        return true;
      }

      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: this.expirationTime,
          keys: {
            p256dh: 'BMockP256dhKeyForPlaywrightE2E1234567890',
            auth: 'MockAuthKey123',
          },
        };
      }
    }

    class MockNotification {}

    Object.defineProperty(MockNotification, 'permission', {
      configurable: true,
      get: () => permission,
    });
    Object.defineProperty(MockNotification, 'requestPermission', {
      configurable: true,
      value: async () => permission,
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: MockNotification,
    });

    const originalMatchMedia = window.matchMedia.bind(window);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => {
        if (query === '(display-mode: standalone)') {
          return {
            matches: options.standalone,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          };
        }
        return originalMatchMedia(query);
      },
    });
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => options.standalone,
    });

    if (!options.supported) {
      // Capability detection uses `in`, so assigning undefined still reports support.
      Reflect.deleteProperty(window, 'PushManager');
    } else {
      Object.defineProperty(window, 'PushManager', {
        configurable: true,
        value: function PushManager() {},
      });
    }

    const pushManager = {
      async getSubscription() {
        return subscribed ? new MockPushSubscription() : null;
      },
      async subscribe() {
        permission = 'granted';
        subscribed = true;
        return new MockPushSubscription();
      },
    };

    // PWA registration and push recovery attach listeners to these browser objects.
    const registration = Object.assign(new EventTarget(), {
      active: {
        scriptURL: '/sw.js',
        state: 'activated',
      },
      ...(options.supported ? { pushManager } : {}),
      async update() {},
    });
    const controller = Object.assign(new EventTarget(), {
      state: 'activated' as ServiceWorkerState,
      scriptURL: '/sw.js',
      postMessage(message: unknown, transfer: Transferable[] = []) {
        if (!message || typeof message !== 'object' || !('type' in message)
          || message.type !== 'FITFOCUS_LEGACY_WRITER_FENCE_CHECK') return;
        const request = message as { challengeId?: unknown; buildId?: unknown };
        const port = transfer[0] as MessagePort | undefined;
        if (!port || typeof request.challengeId !== 'string' || typeof request.buildId !== 'string') return;
        port.postMessage({ type: 'FITFOCUS_LEGACY_WRITER_FENCE_REPLY', challengeId: request.challengeId,
          workerBuildId: request.buildId, complete: true,
          clients: [{ id: 'e2e-current-client', buildId: request.buildId }] });
      },
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        controller,
        async getRegistration() {
          return registration;
        },
        async getRegistrations() {
          return [registration];
        },
        async register() {
          return registration;
        },
        ready: Promise.resolve(registration),
      }),
    });
  }, { options: config });
}

export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#root')).toBeVisible();
}
