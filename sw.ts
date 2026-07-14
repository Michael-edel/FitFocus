/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

const APP_TITLE = 'FitFocus';
const APP_ICON = '/icon.svg';
const sw = self as unknown as ServiceWorkerGlobalScope;

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
precacheAndRoute([]);

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
  event.waitUntil(Promise.resolve());
});
