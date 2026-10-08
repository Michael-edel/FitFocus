import type { AiLastStatus } from '../../geminiService';

export type AiRetryMeta = { cooling: boolean; label: string; title: string };
type LastAiAction = { feature: string; type: string; userId: string } | null;

function retryTypeLabel(type: string): string {
  if (type === 'coach') return 'Coach';
  if (type === 'plan') return 'Plan';
  if (type === 'plateau') return 'Plateau';
  return 'WIS';
}

/** Describes whether and how the last AI operation can be retried from the app shell. */
export function buildAiRetryMeta(lastAction: LastAiAction, status: AiLastStatus | null, now = Date.now()): AiRetryMeta {
  const cooling = (status?.cooldownUntil ?? 0) > now;
  if (!lastAction) return { cooling, label: 'Retry', title: 'Нет действия для повтора' };
  return {
    cooling,
    label: `Retry: ${retryTypeLabel(lastAction.type)}`,
    title: cooling ? 'AI сейчас на паузе из-за квоты. Используйте Force, если понимаете риск.' : 'Повторить последнее действие AI',
  };
}
