import { describe, expect, it } from 'vitest';
import { parseAdaptationUiState } from '../features/adaptation/useAdaptationUiState';

describe('adaptation UI feature', () => {
  it('restores both persisted panel preferences', () => {
    expect(parseAdaptationUiState('1', '1')).toEqual({ read: true, expanded: true });
  });

  it('uses safe defaults for missing or invalid values', () => {
    expect(parseAdaptationUiState(null, null)).toEqual({ read: false, expanded: false });
    expect(parseAdaptationUiState('yes', '0')).toEqual({ read: false, expanded: false });
  });
});
