import type { WeeklyStoredReport } from '../../weeklyAutoEngine';

type AutoTableDocState = { lastAutoTable?: { finalY?: unknown } };

function getAutoTableFinalY(doc: unknown, fallback: number): number {
  const finalY = (doc as AutoTableDocState).lastAutoTable?.finalY;
  return typeof finalY === 'number' && Number.isFinite(finalY) ? finalY : fallback;
}

export function buildWeeklyReportRows(report: WeeklyStoredReport): string[][] {
  return [
    ['Дельта 7 дней', `${report.data.weightDelta7.toFixed(1)} кг`],
    ['Дельта 30 дней', `${report.data.weightDelta30.toFixed(1)} кг`],
    ['Комплаенс', `${report.data.compliance}%`],
    ['Адаптация', `${report.data.adaptationIndex}/100`],
  ];
}

/** Exports one persisted weekly intelligence report as a Cyrillic-capable PDF. */
export async function exportWeeklyReportPdf(report: WeeklyStoredReport): Promise<void> {
  const [{ default: jsPDF }, autoTableModule, { ensurePdfInterFont }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('../../pdf/font'),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF();
  await ensurePdfInterFont(doc);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(18);
  doc.text('FitFocus — Еженедельный AI-отчёт (WIS)', 14, 20);
  doc.setFontSize(12);
  doc.text(`Неделя: ${report.weekKey}`, 14, 30);
  doc.text(`WIS (индекс недели): ${report.data.wis}/100`, 14, 36);
  autoTable(doc, {
    startY: 45,
    styles: { font: 'Inter' },
    head: [['Показатель', 'Значение']],
    body: buildWeeklyReportRows(report),
  });
  if (report.aiText) {
    doc.setFontSize(12);
    const finalY = getAutoTableFinalY(doc, 90);
    doc.text('AI Интерпретация:', 14, finalY + 10);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(report.aiText, 180), 14, finalY + 18);
  }
  doc.save(`FitFocus_Weekly_Report_${report.weekKey}.pdf`);
}