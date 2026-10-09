import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  legacyFingerprint,
  legacyFingerprintFields,
  normalizeLegacyRecord,
  type NormalizedLegacyQueueRecord,
} from '../storage/legacyQueue';

function normalized(record: unknown): NormalizedLegacyQueueRecord {
  const result = normalizeLegacyRecord(record);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('legacy queue normalization', () => {
  it.each([null, undefined, 0, 1, false, true, '', 'record'])(
    'rejects a non-object %j without inventing fields', (record) => {
      expect(normalizeLegacyRecord(record)).toEqual({ ok: false, reason: 'not-an-object' });
    },
  );
  it.each([{}, [], { type: 'update' }, { type: null }, { type: 1 }])('rejects invalid operation %j', (record) => {
    expect(normalizeLegacyRecord(record)).toEqual({ ok: false, reason: 'invalid-type' });
  });
  it.each([undefined, null, '', 0, {}, []])('rejects an invalid key %j', (key) => {
    expect(normalizeLegacyRecord({ type: 'delete', key })).toEqual({ ok: false, reason: 'invalid-key' });
  });
  it.each([undefined, null, 0, false, {}, []])('requires string payloads for put: %j', (value) => {
    expect(normalizeLegacyRecord({ type: 'put', key: 'key', value })).toEqual({ ok: false, reason: 'put-without-value' });
  });
  it.each([undefined, null, '', 'value', 0, false, {}])('rejects even explicitly undefined delete payloads: %j', (value) => {
    expect(normalizeLegacyRecord({ type: 'delete', key: 'key', value })).toEqual({ ok: false, reason: 'delete-with-value' });
  });

  for (const field of ['baseVersion', 'retryCount'] as const) {
    it.each([undefined, null, '0', '', -1, 0.5, NaN, Infinity, -Infinity, false, {}])(
      `rejects present invalid ${field} %j`, (value) => {
        expect(normalizeLegacyRecord({ type: 'delete', key: 'key', [field]: value }))
          .toEqual({ ok: false, reason: `invalid-${field}` });
      },
    );
  }

  it('imports missing metadata as zero and keeps delete without a value property', () => {
    const input = Object.freeze({ type: 'delete', key: 'key' });
    const result = normalized(input);
    expect(result).toEqual({ type: 'delete', key: 'key', baseVersion: 0, retryCount: 0 });
    expect('value' in result).toBe(false);
    expect(input).toEqual({ type: 'delete', key: 'key' });
  });
  it('accepts an empty put payload and preserves string content exactly', () => {
    expect(normalized({ type: 'put', key: ' key ', value: '' }))
      .toEqual({ type: 'put', key: ' key ', value: '', baseVersion: 0, retryCount: 0 });
  });
  it('preserves valid nonnegative integer metadata', () => {
    expect(normalized({ type: 'put', key: 'key', value: 'value', baseVersion: 17, retryCount: 4 }))
      .toEqual({ type: 'put', key: 'key', value: 'value', baseVersion: 17, retryCount: 4 });
  });
  it('detects a value property inherited by a delete object', () => {
    const record: Record<string, unknown> = Object.assign(Object.create({ value: undefined }), { type: 'delete', key: 'key' });
    expect(normalizeLegacyRecord(record)).toEqual({ ok: false, reason: 'delete-with-value' });
  });
});

describe('legacy migration identity', () => {
  it('uses the agreed ordered JSON tuple rather than delimiters or object property order', async () => {
    const record = normalized({ value: 'a|b,"c"', retryCount: 9, key: 'ключ', type: 'put', baseVersion: 3 });
    const canonical = '["put","ключ","a|b,\\"c\\"",3]';
    expect(legacyFingerprintFields(record)).toBe(canonical);
    const expectedHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
    expect(await legacyFingerprint(record)).toBe(`legacy:v1:${expectedHash}`);
  });
  it('does not duplicate an operation when retryCount or missing metadata changes', async () => {
    const first = normalized({ type: 'put', key: 'key', value: 'value' });
    const retried = normalized({ type: 'put', key: 'key', value: 'value', baseVersion: 0, retryCount: 19 });
    expect(await legacyFingerprint(first)).toBe(await legacyFingerprint(retried));
  });
  it('preserves identity when the legacy array is reordered', async () => {
    const first = normalized({ type: 'put', key: 'first', value: 'value' });
    const second = normalized({ type: 'delete', key: 'second' });
    const before = await Promise.all([first, second].map(legacyFingerprint));
    const after = await Promise.all([second, first].map(legacyFingerprint));
    expect(after).toEqual([before[1], before[0]]);
  });
  it('distinguishes delete, empty put, key, payload and base version', async () => {
    const records = [
      { type: 'delete', key: 'key' },
      { type: 'put', key: 'key', value: '' },
      { type: 'put', key: 'key', value: 'value' },
      { type: 'put', key: 'other', value: 'value' },
      { type: 'put', key: 'key', value: 'value', baseVersion: 1 },
    ].map(normalized);
    const fingerprints = await Promise.all(records.map(legacyFingerprint));
    expect(new Set(fingerprints).size).toBe(records.length);
  });
});
