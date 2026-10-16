import { describe, expect, it } from 'vitest';
import { readAiActivity } from '../features/ai/useAiActivityStatus';

describe('AI activity status feature', () => {
  it('keeps a readable retry action when the status record is damaged', () => {
    expect(readAiActivity(
      () => { throw new Error('bad status'); },
      () => ({ feature: 'personal_plan', type: 'plan', userId: 'user-1' }),
    )).toEqual({
      aiStatus: null,
      lastAiAction: { feature: 'personal_plan', type: 'plan', userId: 'user-1' },
    });
  });

  it('keeps a readable status when retry metadata is damaged', () => {
    const status = { ts: 1, feature: 'coach_advice', source: 'live' as const };
    expect(readAiActivity(
      () => status,
      () => { throw new Error('bad action'); },
    )).toEqual({ aiStatus: status, lastAiAction: null });
  });
});