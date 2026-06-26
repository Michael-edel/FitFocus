import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPushNotification } from '../functions/api/_lib/push';

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
    endpoint: 'https://push.example/send/1',
    p256dh: b64url(publicKey),
    auth: b64url(auth),
    content_encoding: 'aes128gcm',
  };
}

describe('Worker-compatible web push sender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an aes128gcm web push request using Web Crypto primitives', async () => {
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
    expect(url).toBe('https://push.example/send/1');
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
  });
});
