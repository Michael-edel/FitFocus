import { useOwnedState } from '../state/useOwnedState';
import type { StateCodec } from '../../storage/stateEditor';

export type AdaptationUiState = {
  read: boolean;
  expanded: boolean;
};

const DEFAULT_ADAPTATION_UI_STATE: AdaptationUiState = {
  read: false,
  expanded: false,
};

export function parseAdaptationUiState(
  readValue: string | null,
  expandedValue: string | null,
): AdaptationUiState {
  return {
    read: readValue === '1',
    expanded: expandedValue === '1',
  };
}

const booleanCodec: StateCodec<boolean> = {
  decode: (raw, fallback) => raw === null ? fallback : raw === '1', encode: (value) => value ? '1' : '0',
};

/** Reading preferences does not enqueue defaults or rewrite legacy storage. */
export function useAdaptationUiState(userId: string | null | undefined) {
  const read = useOwnedState(userId, 'adapt_read', DEFAULT_ADAPTATION_UI_STATE.read, booleanCodec);
  const expanded = useOwnedState(userId, 'adapt_expanded', DEFAULT_ADAPTATION_UI_STATE.expanded, booleanCodec);
  return { adaptRead: read.value, setAdaptRead: read.setValue, adaptExpanded: expanded.value, setAdaptExpanded: expanded.setValue };
}
