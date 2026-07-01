import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { json } from '../functions/api/_lib/auth';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('security and privacy baseline', () => {
  it('ships Cloudflare Pages security headers for static PWA responses', () => {
    expect(existsSync('public/_headers')).toBe(true);
    const headers = read('public/_headers');

    expect(headers).toContain('Strict-Transport-Security:');
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headers).toContain('Permissions-Policy:');
    expect(headers).toContain('Content-Security-Policy:');
    expect(headers).toContain("frame-ancestors 'none'");
  });

  it('adds defensive headers to shared API JSON responses', async () => {
    const response = json({ ok: true });

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('keeps the public privacy policy reachable from static assets and the PWA', () => {
    expect(read('public/privacy.html')).toContain('Cloudflare D1');
    expect(read('PrivacyScreen.tsx')).toContain('Cloudflare D1');
    expect(read('AuthChoiceScreen.tsx')).toContain('/privacy.html');
    expect(read('RegistrationScreen.tsx')).toContain('/privacy.html');
  });

  it('does not export push subscription credentials or broad support rows', () => {
    const exportRoute = read('functions/api/export.ts');

    expect(exportRoute).toContain('FROM push_subscriptions');
    expect(exportRoute).not.toContain('endpoint, p256dh, auth');
    expect(exportRoute).not.toContain('p256dh, auth');
    expect(exportRoute).not.toContain('SELECT * FROM support_feedback');
    expect(exportRoute).not.toContain('SELECT *\\n       FROM support_feedback');
    expect(exportRoute).toContain('SELECT id, user_id, created_at, updated_at, category');
  });

  it('does not return upstream OAuth error details to clients', () => {
    const googleAuth = read('functions/api/auth/google.ts');
    const googleCallback = read('functions/api/auth/google/callback.ts');
    const appleCallback = read('functions/api/auth/apple/callback.ts');

    expect(googleAuth).not.toContain('details:');
    expect(googleAuth).not.toContain('aud: info.aud');
    expect(googleCallback).not.toContain('details: tokenJson');
    expect(googleCallback).not.toContain('details: info');
    expect(appleCallback).not.toContain('details: tokenJson');
  });

  it('does not expose infrastructure diagnostics in user-facing API responses', () => {
    const pushStatus = read('functions/api/push/status.ts');
    const huaweiStatus = read('functions/api/wearable/huawei/status.ts');
    const huaweiStart = read('functions/api/wearable/huawei/start.ts');
    const checkout = read('functions/api/billing/checkout.ts');
    const supportMy = read('functions/api/support/feedback/my.ts');

    expect(pushStatus).not.toContain('missing_config');
    expect(pushStatus).not.toContain('config_keys');
    expect(huaweiStatus).not.toContain('missingConfig');
    expect(huaweiStart).not.toContain('missing: config.missing');
    expect(checkout).not.toContain('error instanceof Error ? error.message');
    expect(checkout).not.toContain('String(error)');
    expect(supportMy).not.toContain('SELECT *');
    expect(supportMy).not.toContain('...ticket');
  });
});
