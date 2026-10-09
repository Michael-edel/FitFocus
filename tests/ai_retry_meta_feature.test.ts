import { describe, expect, it } from 'vitest';
import { buildAiRetryMeta } from '../features/ai/aiRetryMeta';

describe('AI retry metadata', () => {
  it('disables retry messaging when no action exists', () => {
    expect(buildAiRetryMeta(null, null, 100)).toEqual({ cooling: false, label: 'Retry', title: 'Нет действия для повтора' });
  });

  it('maps known actions and exposes active cooldown', () => {
    expect(buildAiRetryMeta({ feature: 'coach', type: 'coach', userId: 'user' }, null, 100)).toMatchObject({ label: 'Retry: Coach', cooling: false });
    expect(buildAiRetryMeta({ feature: 'wis_text', type: 'other', userId: 'user' }, { ts: 1, feature: 'wis', source: 'live', cooldownUntil: 200 }, 100)).toEqual({
      cooling: true,
      label: 'Retry: WIS',
      title: 'AI сейчас на паузе из-за квоты. Используйте Force, если понимаете риск.',
    });
  });
});
