import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensurePdfInterFont } from './font';
import { PDF_COLORS, pdfCard, pdfFooter, pdfH1, pdfSectionTitle } from './theme';
import { formatBloodGlucose, getBloodGlucoseGuidance } from '../profileMath';

type TimelineKind = 'measurement' | 'photo' | 'wearable';

type ProgressArchivePdfItem = {
  kind: TimelineKind;
  date: string;
  title: string;
  detail: string;
};

type ProgressArchivePdfInput = {
  userName: string;
  generatedAt?: string;
  startLabel: string;
  endLabel: string;
  startDate?: string | null;
  endDate?: string | null;
  spanDays?: number | null;
  startWeight?: number | null;
  endWeight?: number | null;
  startWaist?: number | null;
  endWaist?: number | null;
  startPhoto?: string | null;
  endPhoto?: string | null;
  startNote?: string | null;
  endNote?: string | null;
  bloodGlucoseMmolL?: number | null;
  bloodGlucoseMeasuredAt?: string | null;
  bloodGlucoseSourceLabel?: string | null;
  totalPhotos: number;
  totalMeasurements: number;
  wearableLabel: string;
  wearableLastSyncAt?: string | null;
  wearableMetricsUpdatedAt?: string | null;
  summary: string;
  timelineItems: ProgressArchivePdfItem[];
};

const formatDelta = (from?: number | null, to?: number | null, unit = '') => {
  if (typeof from !== 'number' || typeof to !== 'number') return '—';
  const diff = to - from;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)} ${unit}`.trim();
};

const drawImageCard = (doc: jsPDF, x: number, y: number, w: number, h: number, image?: string | null) => {
  pdfCard(doc, x, y, w, h);
  if (!image) {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text('Нет фото', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' } as any);
    return;
  }

  try {
    const props = doc.getImageProperties(image);
    const ratio = Math.min((w - 2) / props.width, (h - 2) / props.height);
    const iw = props.width * ratio;
    const ih = props.height * ratio;
    const ix = x + (w - iw) / 2;
    const iy = y + (h - ih) / 2;
    const format = image.startsWith('data:image/png') ? 'PNG' : image.startsWith('data:image/webp') ? 'WEBP' : 'JPEG';
    doc.addImage(image, format as any, ix, iy, iw, ih);
  } catch {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text('Фото не удалось встроить', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' } as any);
  }
};

export async function downloadProgressArchivePdf(input: ProgressArchivePdfInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await ensurePdfInterFont(doc);
  doc.setFont('Inter', 'normal');

  const generatedAt = input.generatedAt || new Date().toLocaleString('ru-RU');
  const startWeight = typeof input.startWeight === 'number' ? input.startWeight : null;
  const endWeight = typeof input.endWeight === 'number' ? input.endWeight : null;
  const startWaist = typeof input.startWaist === 'number' ? input.startWaist : null;
  const endWaist = typeof input.endWaist === 'number' ? input.endWaist : null;
  const bloodGlucose = typeof input.bloodGlucoseMmolL === 'number' && Number.isFinite(input.bloodGlucoseMmolL) && input.bloodGlucoseMmolL > 0
    ? input.bloodGlucoseMmolL
    : null;
  const bloodGlucoseLabel = bloodGlucose !== null
    ? `${formatBloodGlucose(bloodGlucose)} • ${getBloodGlucoseGuidance(bloodGlucose)}${input.bloodGlucoseMeasuredAt ? ` • ${input.bloodGlucoseMeasuredAt}` : ''}${input.bloodGlucoseSourceLabel ? ` • ${input.bloodGlucoseSourceLabel}` : ''}`
    : null;

  pdfH1(doc, 'FitFocus — Архив прогресса', input.userName);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('Фото, замеры, веса и wearable-история в одном PDF', 14, 36);
  doc.setTextColor(...PDF_COLORS.ink);

  pdfCard(doc, 14, 42, 182, bloodGlucoseLabel ? 28 : 24);
  pdfSectionTitle(doc, 'Сводка', 18, 50);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`Период: ${input.startLabel} → ${input.endLabel}`, 18, 57);
  doc.text(`Фото: ${input.totalPhotos} • Замеры: ${input.totalMeasurements} • Wearable: ${input.wearableLabel}`, 18, 62);
  if (bloodGlucoseLabel) {
    doc.text(`Сахар: ${bloodGlucoseLabel}`, 18, 67, { maxWidth: 174 } as any);
  }
  doc.setTextColor(...PDF_COLORS.ink);

  const metricY = 72;
  const metricW = 88;
  const metricH = 34;

  const renderMetricCard = (x: number, y: number, title: string, value: string, detail: string) => {
    pdfCard(doc, x, y, metricW, metricH);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(12);
    doc.text(title, x + 5, y + 7);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(detail, x + 5, y + 14, { maxWidth: metricW - 10 } as any);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(11);
    doc.text(value, x + 5, y + 27);
  };

  renderMetricCard(14, metricY, 'Период', typeof input.spanDays === 'number' ? `${input.spanDays} дн.` : '—', `${input.startLabel} → ${input.endLabel}`);
  renderMetricCard(
    108,
    metricY,
    'Изменение',
    `${startWeight !== null && endWeight !== null ? `${formatDelta(startWeight, endWeight, 'кг')}` : '—'}`,
    `${startWaist !== null && endWaist !== null ? `Талия: ${formatDelta(startWaist, endWaist, 'см')}` : 'Талия: —'}`
  );

  pdfCard(doc, 14, 110, 182, 88);
  pdfSectionTitle(doc, 'Before / after', 18, 118);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(input.summary, 18, 124, { maxWidth: 174 } as any);
  doc.setTextColor(...PDF_COLORS.ink);

  drawImageCard(doc, 18, 130, 79, 52, input.startPhoto);
  drawImageCard(doc, 113, 130, 79, 52, input.endPhoto);

  doc.setFont('Inter', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('Старт', 18, 186);
  doc.text('Сейчас', 113, 186);
  doc.setTextColor(...PDF_COLORS.ink);

  pdfCard(doc, 14, 204, 182, 42);
  pdfSectionTitle(doc, 'Разница', 18, 212);
  autoTable(doc, {
    startY: 216,
    theme: 'plain',
    styles: { font: 'Inter', fontStyle: 'normal', fontSize: 10, cellPadding: 2, textColor: PDF_COLORS.ink as any },
    headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [248, 250, 252] as any, textColor: PDF_COLORS.muted as any },
    head: [['Показатель', 'Изменение']],
    body: [
      ['Вес', formatDelta(startWeight, endWeight, 'кг')],
      ['Талия', formatDelta(startWaist, endWaist, 'см')],
      ['Сахар', bloodGlucoseLabel || '—'],
      ['Фото', input.startPhoto || input.endPhoto ? 'Есть визуальная история' : 'Нет фото для сравнения'],
      ['Wearable', input.wearableLabel],
    ],
  });

  pdfCard(doc, 14, 252, 182, 32);
  pdfSectionTitle(doc, 'Подробности', 18, 260);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(
    [
      input.wearableLastSyncAt ? `Последний sync часов: ${input.wearableLastSyncAt}` : null,
      input.wearableMetricsUpdatedAt ? `Метрики обновлены: ${input.wearableMetricsUpdatedAt}` : null,
      bloodGlucoseLabel ? `Сахар: ${bloodGlucoseLabel}` : null,
      input.startNote || input.endNote ? `Подписи фото: ${[input.startNote, input.endNote].filter(Boolean).join(' / ')}` : null,
    ].filter(Boolean).join(' • ') || 'Нет дополнительных данных',
    18,
    266,
    { maxWidth: 174 } as any,
  );
  doc.setTextColor(...PDF_COLORS.ink);

  const remainingTimeline = input.timelineItems.slice(0, 8);
  if (remainingTimeline.length) {
    doc.addPage();
    pdfH1(doc, 'FitFocus — Архив прогресса', input.userName);
    pdfSectionTitle(doc, 'Последние события', 14, 40);
    autoTable(doc, {
      startY: 46,
      theme: 'plain',
      styles: { font: 'Inter', fontStyle: 'normal', fontSize: 10, cellPadding: 2, textColor: PDF_COLORS.ink as any },
      headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [248, 250, 252] as any, textColor: PDF_COLORS.muted as any },
      head: [['Дата', 'Тип', 'Событие']],
      body: remainingTimeline.map((item) => [item.date, item.title, item.detail]),
    });
  }

  pdfFooter(doc, generatedAt);
  doc.save(`FitFocus_Progress_Archive_${input.startLabel}_to_${input.endLabel}.pdf`);
}
