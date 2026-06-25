import { describe, expect, it } from 'vitest';
import { base64UrlEncode, signState, verifyState } from '../functions/api/auth/_oauth';

const SECRET = 'unit-test-secret';
const NOW_MS = 1_700_000_000_000;

async function makeState(payload: Record<string, unknown>) {
  const raw = JSON.stringify({ t: NOW_MS, n: 'nonce-1', ...payload });
  const stateB64 = base64UrlEncode(new TextEncoder().encode(raw));
  const sig = await signState(raw, SECRET);
  return `${stateB64}.${sig}`;
}

describe('verifyState', () => {
  it('accepts a valid signed state', async () => {
    const state = await makeState({ r: '/dashboard' });
    const parsed = await verifyState(state, SECRET, { expectedNonce: 'nonce-1', nowMs: NOW_MS });

    expect(parsed?.r).toBe('/dashboard');
  });

  it('rejects tampered or structurally invalid state values without throwing', async () => {
    const state = await makeState({ r: '/dashboard' });

    await expect(verifyState(`${state.slice(0, -1)}x`, SECRET, { expectedNonce: 'nonce-1', nowMs: NOW_MS })).resolves.toBeNull();
    await expect(verifyState('not-base64.signature', SECRET, { expectedNonce: 'nonce-1', nowMs: NOW_MS })).resolves.toBeNull();
    await expect(verifyState(`${state}.extra`, SECRET, { expectedNonce: 'nonce-1', nowMs: NOW_MS })).resolves.toBeNull();
  });
});
