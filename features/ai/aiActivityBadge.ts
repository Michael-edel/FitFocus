import type { AiLastStatus } from '../../geminiService';

export type AiActivityBadge = { label: string; cls: string; title: string };

const IDLE_BADGE: AiActivityBadge = {
  label: 'AI: готов',
  cls: 'bg-slate-800/60 text-slate-300 border-slate-700',
  title: 'AI готов к работе',
};

/** Maps persisted AI delivery state to the compact status badge used by the app shell. */
export function buildAiActivityBadge(
  status: AiLastStatus | null,
  now = Date.now(),
  formatTime: (value: number) => string = (value) => new Date(value).toLocaleTimeString(),
): AiActivityBadge {
  if (!status) return IDLE_BADGE;
  if ((status.cooldownUntil ?? 0) > now) {
    return {
      label: 'AI: пауза',
      cls: 'bg-amber-500/10 text-amber-200 border-amber-500/20',
      title: `AI временно ограничен (квота/лимит). Используется кэш/фолбэк до ${formatTime(status.cooldownUntil)}`,
    };
  }
  if (status.source.includes('cooldown')) {
    return { label: 'AI: кэш', cls: 'bg-amber-500/10 text-amber-200 border-amber-500/20', title: status.reason || 'Используется кэш из-за лимитов' };
  }
  if (status.source === 'cache') {
    return { label: 'AI: кэш', cls: 'bg-indigo-500/10 text-indigo-200 border-indigo-500/20', title: 'Показывается ранее сгенерированный результат' };
  }
  if (status.source === 'fallback') {
    return { label: 'AI: офлайн', cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20', title: status.reason || 'AI недоступен, используется локальный совет' };
  }
  if (status.source === 'error') {
    return { label: 'AI: ошибка', cls: 'bg-rose-500/10 text-rose-200 border-rose-500/20', title: status.reason || 'Ошибка AI' };
  }
  return { label: 'AI: online', cls: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20', title: 'AI отвечает в реальном времени' };
}
