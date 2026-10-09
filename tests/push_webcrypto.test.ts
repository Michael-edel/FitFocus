import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedPushEndpoint, normalizePushDeliveryTimeoutMs, sendPushNotification } from '../functions/api/_lib/push';

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function makeVapidEnv() {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const x = b64urlToBytes(jwk.x!);
  const y = b64urlToBytes(jwk.y!);
  const publicKey = new Uint8Array(65);
  publicKey[0] = 4;
  publicKey.set(x, 1);
  publicKey.set(y, 33);

  return {
    PUSH_VAPID_PUBLIC_KEY: b64url(publicKey),
    PUSH_VAPID_PRIVATE_KEY: jwk.d!,
    PUSH_VAPID_SUBJECT: 'mailto:test@example.com',
  };
}

async function makeSubscription() {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const auth = new Uint8Array(16);
  crypto.getRandomValues(auth);
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/1',
    p256dh: b64url(publicKey),
    auth: b64url(auth),
    content_encoding: 'aes128gcm',
  };
}

describe('Worker-compatible web push sender', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends an aes128gcm web push request using Web Crypto primitives', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 201 }));

    const response = await sendPushNotification(
      await makeVapidEnv(),
      await makeSubscription(),
      { title: 'FitFocus', body: 'test' },
    );

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/1');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      TTL: '604800',
      Urgency: 'normal',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
    });
    expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^vapid t=.+, k=.+/);
    expect(init?.body).toBeInstanceOf(ArrayBuffer);
    expect((init?.body as ArrayBuffer).byteLength).toBeGreaterThan(86);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled request through the actual encrypted push delivery path', async () => {
    const env = { ...(await makeVapidEnv()), PUSH_DELIVERY_TIMEOUT_MS: '1000' };
    const subscription = await makeSubscription();
    vi.useFakeTimers();
    let started!: (signal: AbortSignal | null | undefined) => void;
    const requestStarted = new Promise<AbortSignal | null | undefined>((resolve) => { started = resolve; });
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      started(init?.signal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    const outcome = sendPushNotification(env, subscription, { title: 'FitFocus' })
      .catch((error: Error) => error);
    const signal = await requestStarted;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    expect(await outcome).toMatchObject({ message: 'PUSH_REQUEST_TIMEOUT' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves upstream HTTP errors and clears the request deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }));

    await expect(sendPushNotification(
      await makeVapidEnv(), await makeSubscription(), { title: 'FitFocus' },
    )).rejects.toMatchObject({ message: 'PUSH_HTTP_503: unavailable', statusCode: 503 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves network failures and clears the request deadline', async () => {
    vi.useFakeTimers();
    const failure = new Error('connection failed');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(failure);

    await expect(sendPushNotification(
      await makeVapidEnv(), await makeSubscription(), { title: 'FitFocus' },
    )).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects endpoints outside known browser push services', async () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/1')).toBe(true);
    expect(isAllowedPushEndpoint('https://push-wns.notify.windows.com/w/token')).toBe(true);
    expect(isAllowedPushEndpoint('https://127.0.0.1/internal')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.test/push')).toBe(false);

    await expect(sendPushNotification(
      await makeVapidEnv(),
      { ...(await makeSubscription()), endpoint: 'https://127.0.0.1/internal' },
      { title: 'FitFocus' },
    )).rejects.toThrow('PUSH_ENDPOINT');
  });

  it('rejects endpoints outside known browser push services', async () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/1')).toBe(true);
    expect(isAllowedPushEndpoint('https://push-wns.notify.windows.com/w/token')).toBe(true);
    expect(isAllowedPushEndpoint('https://127.0.0.1/internal')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.test/push')).toBe(false);

    await expect(sendPushNotification(
      await makeVapidEnv(),
      { ...(await makeSubscription()), endpoint: 'https://127.0.0.1/internal' },
      { title: 'FitFocus' },
    )).rejects.toThrow('PUSH_ENDPOINT');
  });
});
