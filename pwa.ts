/**
 * PWA регистрация должна работать ТОЛЬКО в среде Vite (dev/build),
 * потому что virtual:pwa-register — виртуальный модуль Vite.
 *
 * В Google AI Studio (native ESM через importmap) import.meta.env отсутствует,
 * поэтому мы просто ничего не делаем.
 */
import { isRecord } from './safeJson';

let pwaInitPromise: Promise<void> | null = null;
let pushRecoveryListenerInstalled = false;
let pushRecoveryInFlight: Promise<void> | null = null;

export function ensurePWAStarted() {
  if (!pwaInitPromise) {
    pwaInitPromise = initPWA();
  }
  return pwaInitPromise;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function recoverPushSubscription(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const statusResponse = await fetch('/api/push/status', {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!statusResponse.ok) return;
  const status: unknown = await statusResponse.json().catch(() => null);
  if (!isRecord(status)) return;
  const statusRecord = status;
  const publicKey = typeof statusRecord.vapid_public_key === 'string' ? statusRecord.vapid_public_key.trim() : '';
  if (!publicKey || statusRecord.configured !== true) return;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    });
  }

  await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

export function installPushSubscriptionRecovery(): void {
  if (pushRecoveryListenerInstalled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  pushRecoveryListenerInstalled = true;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!isRecord(data) || data.type !== 'FITFOCUS_PUSH_RESUBSCRIBE') return;
    if (!pushRecoveryInFlight) {
      pushRecoveryInFlight = recoverPushSubscription()
        .catch(() => undefined)
        .finally(() => {
          pushRecoveryInFlight = null;
        });
    }
  });
}

async function initPWA() {
  const env = import.meta.env;
  if (!env) return;

  installPushSubscriptionRecovery();

  try {
    const storedBuildId = localStorage.getItem('fitfocus.build.id');
    if (storedBuildId !== __FITFOCUS_BUILD_ID__) {
      const keysToDrop: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (/^fitfocus_data_.*_all_users$/.test(key)) keysToDrop.push(key);
      }
      for (const key of keysToDrop) {
        localStorage.removeItem(key);
      }
      localStorage.setItem('fitfocus.build.id', __FITFOCUS_BUILD_ID__);
    }
  } catch {}

  try {
    const mod = await import('virtual:pwa-register');
    type RegisterSw = (options: {
      immediate: boolean;
      onNeedRefresh: () => void;
      onRegisteredSW: (swScriptUrl: string, registration?: ServiceWorkerRegistration) => void;
      onRegisterError: (error: unknown) => void;
    }) => (reloadPage?: boolean) => Promise<void>;
    const registerSW = mod.registerSW as RegisterSw;
    let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW?.(true);
      },
      onRegisteredSW(_swScriptUrl: string, registration?: ServiceWorkerRegistration) {
        // Показываем новую сборку при следующем обновлении, не оставляя старые чанки висеть.
        if (registration) {
          void registration.update?.();
        }
      },
      onRegisterError(error: unknown) {
        console.error('SW registration error', error);
      },
    });

  } catch (e) {
    // В dev-среде без плагина или при проблемах с билдом — не валим приложение.
    console.warn('PWA registration skipped:', e);
  }
}
