import { describe, expect, it } from 'vitest';
import type { AiLastStatus } from '../geminiService';
import { buildAiActivityBadge } from '../features/ai/aiActivityBadge';

const status = (source: AiLastStatus['source'], overrides: Partial<AiLastStatus> = {}): AiLastStatus => ({
  ts: 100,
  feature: 'coach',
  source,
  ...overrides,
});

describe('AI activity badge', () => {
  it('shows idle state when no status exists', () => {
    expect(buildAiActivityBadge(null)).toMatchObject({ label: 'AI: готов' });
  });

  it('prioritizes an active cooldown over the recorded source', () => {
    expect(buildAiActivityBadge(status('live', { cooldownUntil: 2_000 }), 1_000, () => '12:00')).toMatchObject({
      label: 'AI: пауза',
      title: expect.stringContaining('12:00'),
    });
  });

  it('maps cooldown cache, cached, fallback, error and live outcomes', () => {
    expect(buildAiActivityBadge(status('cooldown-cache', { reason: 'лимит' }), 1_000)).toMatchObject({ label: 'AI: кэш', title: 'лимит' });
    expect(buildAiActivityBadge(status('cache'), 1_000)).toMatchObject({ label: 'AI: кэш' });
    expect(buildAiActivityBadge(status('fallback'), 1_000)).toMatchObject({ label: 'AI: офлайн' });
    expect(buildAiActivityBadge(status('error'), 1_000)).toMatchObject({ label: 'AI: ошибка' });
    expect(buildAiActivityBadge(status('live'), 1_000)).toMatchObject({ label: 'AI: online' });
  });
});
