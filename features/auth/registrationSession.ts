export type RegistrationSessionStatus = 'checking' | 'active' | 'unavailable' | 'changed';

export type RegistrationSessionState = {
  identity: string | null;
  status: RegistrationSessionStatus;
};

/** Registration UI and actions are available only after this exact Google identity owns the active session. */
export function isRegistrationSessionReady(
  identity: string | null | undefined,
  state: RegistrationSessionState,
): boolean {
  return Boolean(identity) && state.identity === identity && state.status === 'active';
}
