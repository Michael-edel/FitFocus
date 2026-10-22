import { describe, expect, it } from 'vitest';
import { buildWeeklyReportRows } from '../features/progress/exportWeeklyReportPdf';

describe('weekly report PDF feature', () => {
  it('formats the stable report metrics for the PDF table', () => {
    const report = {
      weekKey: '2026-41',
      data: { wis: 72, weightDelta7: -0.45, weightDelta30: 1.2, compliance: 81, adaptationIndex: 34 },
    } as never;
    expect(buildWeeklyReportRows(report)).toEqual([
      ['Дельта 7 дней', '-0.5 кг'],
      ['Дельта 30 дней', '1.2 кг'],
      ['Комплаенс', '81%'],
      ['Адаптация', '34/100'],
    ]);
  });
});