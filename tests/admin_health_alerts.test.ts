import { describe, expect, it } from 'vitest';
import { evaluateAdminHealthAlerts } from '../functions/api/_lib/admin_health_alerts';

describe('admin health alerts', () => {
  it('does not alert on a small sample of AI calls', () => {
    expect(evaluateAdminHealthAlerts({ calls: 4, errors: 4, avgLatencyMs: 9_000 })).toEqual([]);
  });

  it('reports error-rate and latency alerts with stable thresholds', () => {
    expect(evaluateAdminHealthAlerts({ calls: 20, errors: 5, avgLatencyMs: 5_200 })).toEqual([
      { code: 'ai_error_rate', severity: 'critical', message: 'Высокая доля ошибок AI за сегодня', value: 25, threshold: 25 },
      { code: 'ai_latency', severity: 'critical', message: 'Критически высокая задержка AI за сегодня', value: 5_200, threshold: 5_000 },
    ]);
  });
});
