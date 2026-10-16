export type AdminHealthAlert = {
  code: 'ai_error_rate' | 'ai_latency';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
};

type AiHealthMetrics = { calls: number; errors: number; avgLatencyMs: number };

/** Turns noisy raw AI metrics into actionable alerts only when the sample is meaningful. */
export function evaluateAdminHealthAlerts({ calls, errors, avgLatencyMs }: AiHealthMetrics): AdminHealthAlert[] {
  const alerts: AdminHealthAlert[] = [];
  if (calls >= 20) {
    const errorRate = Math.round((Math.max(0, errors) / calls) * 100);
    if (errorRate >= 25) {
      alerts.push({ code: 'ai_error_rate', severity: 'critical', message: 'Высокая доля ошибок AI за сегодня', value: errorRate, threshold: 25 });
    } else if (errorRate >= 10) {
      alerts.push({ code: 'ai_error_rate', severity: 'warning', message: 'Повышенная доля ошибок AI за сегодня', value: errorRate, threshold: 10 });
    }
  }

  if (calls >= 10) {
    if (avgLatencyMs >= 5_000) {
      alerts.push({ code: 'ai_latency', severity: 'critical', message: 'Критически высокая задержка AI за сегодня', value: avgLatencyMs, threshold: 5_000 });
    } else if (avgLatencyMs >= 2_500) {
      alerts.push({ code: 'ai_latency', severity: 'warning', message: 'Повышенная задержка AI за сегодня', value: avgLatencyMs, threshold: 2_500 });
    }
  }

  return alerts;
}
