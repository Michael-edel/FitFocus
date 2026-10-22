import { useOwnedState } from '../state/useOwnedState';
import type { StateCodec } from '../../storage/stateEditor';

export function parseInviteCode(raw: string | null): string {
  return raw ?? '';
}

const inviteCodec: StateCodec<string> = { decode: (raw) => parseInviteCode(raw), encode: (value) => value };

/** The active profile is explicit; a captured setter never writes another profile. */
export function useInviteCodeState(userId: string | null | undefined) {
  const state = useOwnedState(userId, 'invite_code', '', inviteCodec);
  return { inviteCode: state.value, setInviteCode: state.setValue };
}
