import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REMOTE_KV_OUTBOX_STORAGE_KEY, safeRemoveItem, safeSetItem, shouldMirrorKey } from '../storage/hybrid';
function localStore(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (k) => values.get(k) ?? null,
    key: (i) => [...values.keys()][i] ?? null, removeItem: (k) => { values.delete(k); }, setItem: (k, v) => { values.set(k, String(v)); } };
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('localStorage', localStore()); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('retired automatic state mirror', () => {
  it('keeps AI/device metadata local and preserves an old source byte for byte', async () => {
    const source = '[{"type":"put","key":"fitfocus_data_old_refeed","value":"2026-10-12"}]';
    localStorage.setItem(REMOTE_KV_OUTBOX_STORAGE_KEY, source);
    safeSetItem('ff_ai_last_status_v1', 'local'); safeRemoveItem('ff_ai_last_action_v1');
    safeSetItem('fitfocus_data_owner_all_users', '[]');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(localStorage.getItem(REMOTE_KV_OUTBOX_STORAGE_KEY)).toBe(source);
    expect(localStorage.getItem('ff_ai_last_status_v1')).toBe('local'); expect(fetch).not.toHaveBeenCalled();
    expect(shouldMirrorKey('ff_ai_last_status_v1')).toBe(false);
  });
  it('rejects unowned raw writes and deletes instead of guessing an account from a key', () => {
    const key = 'fitfocus_data_some_owner_refeed'; localStorage.setItem(key, 'old');
    expect(() => safeSetItem(key, 'new')).toThrow('OWNED_STATE_REPOSITORY_REQUIRED');
    expect(() => safeRemoveItem(key)).toThrow('OWNED_STATE_REPOSITORY_REQUIRED');
    expect(localStorage.getItem(key)).toBe('old');
  });
  it('makes the legacy source read-only for the old helper', () => {
    localStorage.setItem(REMOTE_KV_OUTBOX_STORAGE_KEY, '[]');
    expect(() => safeSetItem(REMOTE_KV_OUTBOX_STORAGE_KEY, 'changed')).toThrow('LEGACY_SOURCE_READ_ONLY');
    expect(() => safeRemoveItem(REMOTE_KV_OUTBOX_STORAGE_KEY)).toThrow('LEGACY_SOURCE_READ_ONLY');
    expect(localStorage.getItem(REMOTE_KV_OUTBOX_STORAGE_KEY)).toBe('[]');
  });
});
