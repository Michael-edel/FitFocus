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
    id: 'user-e2e',
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

  if (options.session === 'app' || options.session === 'register') {
    await installPushMocks(page, push);
  } else if (push.standalone) {
    await installStandaloneModeMock(page, true);
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();

    const json = async (payload: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
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
      });
      return;
    }

    if (path === '/api/bootstrap' && method === 'GET') {
      if (options.session === 'app') {
        await json({ profile, items: [] });
        return;
      }
      await json({ profile: null, items: [] });
      return;
    }

    if (path === '/api/profile' && method === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown> | null;
      await json({
        profile: {
          ...profile,
          ...(body || {}),
          googleSub: 'google-e2e-sub',
          email: 'e2e@example.com',
          aiPlan: defaultAiPlan,
        },
      });
      return;
    }

    if (path === '/api/push/status' && method === 'GET') {
      const currentSubscriptionId = push.supported && push.preSubscribed ? 'sub-e2e-1' : null;
      const currentBrowserLabel = await page.evaluate(() => {
        const ua = navigator.userAgent;
        if (/Firefox/i.test(ua)) return 'Firefox';
        if (/Edg/i.test(ua)) return 'Edge';
        if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
        if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
        return 'Браузер';
      });
      await json({
        configured: push.configured,
        vapid_public_key: push.configured ? 'BEl6eA3k0t7K8U3d5j4LmE2E2mockPublicKeyForPlaywright12345' : '',
        missing_config: push.configured ? [] : ['PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY'],
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
      Object.defineProperty(window, 'PushManager', {
        configurable: true,
        value: undefined,
      });
      return;
    }

    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    });

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

    const registration = {
      active: {
        scriptURL: '/sw.js',
        state: 'activated',
      },
      pushManager,
      async update() {},
    };

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
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
      },
    });
  }, { options: config });
}

export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#root')).toBeVisible();
}
