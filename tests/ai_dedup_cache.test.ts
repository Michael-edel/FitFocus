import { describe, expect, it, vi } from 'vitest';
import { readAiDedupCache, writeAiDedupCache } from '../functions/api/_lib/ai_dedup_cache';

describe('AI dedup cache', () => {
  it('returns a cache value when KV is available', async () => {
    const cache = { get: vi.fn().mockResolvedValue({ data: { text: 'cached' } }), put: vi.fn() };
    await expect(readAiDedupCache(cache, 'dedup-key')).resolves.toEqual({ data: { text: 'cached' } });
    expect(cache.get).toHaveBeenCalledWith('dedup-key', { type: 'json' });
  });

  it('treats KV read and write failures as cache misses', async () => {
    const cache = { get: vi.fn().mockRejectedValue(new Error('KV unavailable')), put: vi.fn().mockRejectedValue(new Error('KV unavailable')) };
    await expect(readAiDedupCache(cache, 'dedup-key')).resolves.toBeNull();
    await expect(writeAiDedupCache(cache, 'dedup-key', { answer: 'ok' })).resolves.toBe(false);
  });
});
