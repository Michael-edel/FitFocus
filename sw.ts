/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import {
  LEGACY_WRITER_FENCE_CHECK,
  LEGACY_WRITER_FENCE_PROBE,
  LEGACY_WRITER_FENCE_REPLY,
  doesLegacyWriterFenceCoverCurrentClients,
} from './storage/legacyWriterFence';

const APP_TITLE = 'FitFocus';
const APP_ICON = '/icon.svg';
type WorkboxManifestEntry = string | { url: string; revision?: string | null };
type WorkboxServiceWorkerScope = ServiceWorkerGlobalScope & {
  __WB_MANIFEST: WorkboxManifestEntry[];
};
declare global {
  // Vite's service-worker build types `self` as Window in the main tsconfig.
  interface Window {
    __WB_MANIFEST: WorkboxManifestEntry[];
  }
}

const sw = self as unknown as WorkboxServiceWorkerScope;
const LEGACY_WRITER_PROBE_TIMEOUT_MS = 1_500;

type JsonRecord = Record<string, unknown>;

type PushNotificationAction = {
  action: string;
  title: string;
  icon?: string;
};

type ServiceWorkerNotificationOptions = NotificationOptions & {
  badge?: string;
  tag?: string;
  renotify?: boolean;
  data?: JsonRecord;
  actions?: PushNotificationAction[];
  requireInteraction?: boolean;
};

type PushNotificationPayload = {
  title?: string;
  body?: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: JsonRecord;
  actions?: PushNotificationAction[];
  requireInteraction?: boolean;
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeActions = (value: unknown): PushNotificationAction[] => {
  const actions = (Array.isArray(value) ? value : [])
    .map((raw): PushNotificationAction | null => {
      if (!isRecord(raw)) return null;
      const action = nonEmptyString(raw.action);
      const title = nonEmptyString(raw.title);
      const icon = nonEmptyString(raw.icon);
      return action && title ? { action, title, ...(icon ? { icon } : {}) } : null;
    })
    .filter((action): action is PushNotificationAction => Boolean(action))
    .slice(0, 3);

  return actions.length > 0 ? actions : [{ action: 'open', title: 'Открыть' }];
};

const normalizeTargetUrl = (value: unknown): string => {
  const raw = nonEmptyString(value) || '/';
  try {
    const url = new URL(raw, sw.location.origin);
    if (url.origin !== sw.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
};

const parsePushPayload = (event: PushEvent): PushNotificationPayload => {
  const rawText = event.data?.text() || '';
  if (!rawText) return {};

  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!isRecord(parsed)) return { body: rawText };

    return {
      title: nonEmptyString(parsed.title),
      body: nonEmptyString(parsed.body),
      url: normalizeTargetUrl(parsed.url),
      icon: nonEmptyString(parsed.icon),
      badge: nonEmptyString(parsed.badge),
      tag: nonEmptyString(parsed.tag),
      data: isRecord(parsed.data) ? parsed.data : undefined,
      actions: normalizeActions(parsed.actions),
      requireInteraction: parsed.requireInteraction === true,
    };
  } catch {
    return { body: rawText };
  }
};

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// injectManifest requires its own activation handler. Do not skip waiting on install:
// the client first asks the user to save edits in every open FitFocus tab.
sw.addEventListener('message', (event) => {
  if (!isRecord(event.data)) return;
  if (event.data.type === 'SKIP_WAITING') {
    event.waitUntil(sw.skipWaiting());
    return;
  }
  if (event.data.type === LEGACY_WRITER_FENCE_CHECK) {
    const replyPort = event.ports[0];
    const challengeId = event.data.challengeId;
    const requestedBuildId = event.data.buildId;
    if (!replyPort || typeof challengeId !== 'string' || typeof requestedBuildId !== 'string') return;
    event.waitUntil((async () => {
      const source = event.source && 'id' in event.source ? event.source as Client : null;
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const clients = await Promise.all(windows.map(async (client) => {
        const channel = new MessageChannel();
        const evidence = await new Promise<{ id: string; buildId: string | null }>((resolve) => {
          let settled = false;
          const finish = (buildId: string | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            channel.port1.close();
            channel.port2.close();
            resolve({ id: client.id, buildId });
          };
          const timer = setTimeout(() => finish(null), LEGACY_WRITER_PROBE_TIMEOUT_MS);
          channel.port1.onmessage = (messageEvent: MessageEvent<unknown>) => {
            const reply = messageEvent.data;
            if (!isRecord(reply) || reply.type !== LEGACY_WRITER_FENCE_REPLY
              || reply.challengeId !== challengeId || typeof reply.buildId !== 'string') return finish(null);
            finish(reply.buildId);
          };
          try {
            client.postMessage({ type: LEGACY_WRITER_FENCE_PROBE, challengeId }, [channel.port2]);
          } catch {
            finish(null);
          }
        });
        return evidence;
      }));
      const complete = doesLegacyWriterFenceCoverCurrentClients(
        requestedBuildId,
        __FITFOCUS_BUILD_ID__,
        source?.id,
        clients,
      );
      replyPort.postMessage({ type: LEGACY_WRITER_FENCE_REPLY, challengeId,
        workerBuildId: __FITFOCUS_BUILD_ID__, complete, clients });
      replyPort.close();
    })().catch(() => {
      replyPort.postMessage({ type: LEGACY_WRITER_FENCE_REPLY, challengeId,
        workerBuildId: __FITFOCUS_BUILD_ID__, complete: false, clients: [] });
      replyPort.close();
    }));
  }
});

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'fitfocus-navigation',
  })
);

registerRoute(
  ({ request, url }) =>
    url.origin === sw.location.origin &&
    ['script', 'style', 'image', 'font'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: 'fitfocus-static',
  })
);

sw.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const targetUrl = normalizeTargetUrl(payload.url);
  const options: ServiceWorkerNotificationOptions = {
    body: payload.body || 'У вас новое уведомление от FitFocus.',
    icon: payload.icon || APP_ICON,
    badge: payload.badge || APP_ICON,
    tag: payload.tag || 'fitfocus-push',
    renotify: true,
    data: {
      ...(payload.data || {}),
      url: targetUrl,
    },
    actions: payload.actions || [{ action: 'open', title: 'Открыть' }],
    requireInteraction: payload.requireInteraction === true,
  };

  event.waitUntil(
    sw.registration.showNotification(payload.title || APP_TITLE, options)
  );
});

sw.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = isRecord(notification.data) ? notification.data : {};
  const targetUrl = normalizeTargetUrl(data.url);

  notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          if ('navigate' in client && 'url' in client && client.url.startsWith(sw.location.origin)) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore navigation failures and try focus anyway
            }
          }
          await client.focus();
          return;
        }
      }

      await sw.clients.openWindow(targetUrl);
    })()
  );
});

sw.addEventListener('pushsubscriptionchange', (event) => {
  type PushSubscriptionChangeEventLike = ExtendableEvent & {
    newSubscription?: PushSubscription | null;
  };

  const change = event as PushSubscriptionChangeEventLike;
  event.waitUntil((async () => {
    let subscription = change.newSubscription || null;
    if (!subscription) {
      subscription = await sw.registration.pushManager.getSubscription().catch(() => null);
    }

    if (subscription) {
      await fetch(new URL('/api/push/subscribe', sw.location.origin), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      return;
    }

    const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.map((client) => client.postMessage({ type: 'FITFOCUS_PUSH_RESUBSCRIBE' })));
  })().catch(() => undefined));
});
