export const testSessionId = 'a'.repeat(64);
export function sessionMe(accountId: string, extraUser: Record<string, unknown> = {}) {
  return { user: { sub: accountId, ...extraUser }, hasAccess: true,
    stateSync: { protocol: 2, guard: 1, accountId, sessionId: testSessionId },
    bootstrapSync: { protocol: 1, guard: 1 }, profileSync: { protocol: 1, guard: 1 } };
}
export function sessionHeaders(accountId: string, resource: 'state' | 'bootstrap') {
  const name = resource === 'state' ? 'State' : 'Bootstrap';
  return { [`X-FitFocus-${name}-Protocol`]: resource === 'state' ? '2' : '1', [`X-FitFocus-${name}-Guard`]: '1',
    'X-FitFocus-State-Account': accountId, 'X-FitFocus-State-Session': testSessionId };
}
