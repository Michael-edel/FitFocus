/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

const APP_TITLE = 'FitFocus';
const APP_ICON = '/icon.svg';
const sw = self as ServiceWorkerGlobalScope;

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
  let payload: any = {};
  try {
    payload = event.data?.json?.() ?? JSON.parse(event.data?.text?.() || '{}');
  } catch {
    payload = { body: event.data?.text?.() || '' };
  }

  const title = String(payload?.title || APP_TITLE);
  const body = String(payload?.body || 'У вас новое уведомление от FitFocus.');
  const url = String(payload?.url || '/');

  event.waitUntil(
      sw.registration.showNotification(title, {
      body,
      icon: String(payload?.icon || APP_ICON),
      badge: String(payload?.badge || APP_ICON),
      tag: String(payload?.tag || 'fitfocus-push'),
      renotify: true,
      data: {
        ...(payload?.data || {}),
        url,
      },
      actions: Array.isArray(payload?.actions) ? payload.actions : [{ action: 'open', title: 'Открыть' }],
      requireInteraction: Boolean(payload?.requireInteraction),
    } as NotificationOptions)
  );
});

sw.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification.data || {}) as { url?: string };
  const targetUrl = data.url || '/';

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
