import { expect, it } from 'vitest';
import { ProfileDraftHydration } from '../features/settings/profileDraftHydration';

it('does not reread stale dirty cache after a successful save publishes the profile', () => {
  const hydration = new ProfileDraftHydration();
  expect(hydration.take('account/session', true, false)).toBe(true);
  hydration.consume('account/session'); // Explicit edit/save.
  // The saved callback cleared dirty, but cache persistence has not run yet.
  expect(hydration.take('account/session', true, false)).toBe(false);
  expect(hydration.take('account/session', true, false)).toBe(false);
});

it('waits for cache readiness before restoring the untouched initial draft once', () => {
  const hydration = new ProfileDraftHydration();
  expect(hydration.take('account/session', false, false)).toBe(false);
  expect(hydration.take('account/session', true, false)).toBe(true);
  expect(hydration.take('account/session', true, false)).toBe(false);
});

it('protects typing or a save before delayed cache readiness', () => {
  for (const action of ['edit', 'save']) {
    const hydration = new ProfileDraftHydration();
    expect(hydration.take('account/session', false, false)).toBe(false);
    hydration.consume('account/session');
    expect(hydration.take('account/session', true, action === 'edit')).toBe(false);
  }
});

it('preserves an already dirty draft even if its edit predates readiness', () => {
  const hydration = new ProfileDraftHydration();
  expect(hydration.take('account/session', false, true)).toBe(false);
  expect(hydration.take('account/session', true, false)).toBe(false);
});

it('allows initial restoration for a new account or session, independently of old dirty state', () => {
  const hydration = new ProfileDraftHydration();
  hydration.consume('account/session-one');
  expect(hydration.take('account/session-two', true, false)).toBe(true);
  expect(hydration.take('other-account/session', true, false)).toBe(true);
  expect(hydration.take('account/session-one', true, false)).toBe(false);
});

it('consumes clean or malformed cache attempts instead of repeatedly rereading them', () => {
  const hydration = new ProfileDraftHydration();
  expect(hydration.take('account/session', true, false)).toBe(true);
  // Caller ignores a clean/malformed envelope and uses the profile snapshot.
  expect(hydration.take('account/session', true, false)).toBe(false);
});
