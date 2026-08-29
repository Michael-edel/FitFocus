import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ensurePdfInterFont } from './font';
import { PDF_COLORS, pdfCard, pdfFooter, pdfH1, pdfSectionTitle } from './theme';

type ComparisonValue = number | null | undefined;

type ProgressComparisonPdfInput = {
  userName: string;
  generatedAt?: string;
  fromKey: string;
  toKey: string;
  fromLabel: string;
  toLabel: string;
  fromWeight?: ComparisonValue;
  toWeight?: ComparisonValue;
  fromWaist?: ComparisonValue;
  toWaist?: ComparisonValue;
  fromPulse?: ComparisonValue;
  toPulse?: ComparisonValue;
  fromPhoto: boolean;
  toPhoto: boolean;
  totalPhotos: number;
  totalMeasurements: number;
};

const formatDelta = (from?: ComparisonValue, to?: ComparisonValue, unit = '') => {
  if (typeof from !== 'number' || typeof to !== 'number') return '—';
  const diff = to - from;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)} ${unit}`.trim();
};

export async function downloadProgressComparisonPdf(input: ProgressComparisonPdfInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await ensurePdfInterFont(doc);
  doc.setFont('Inter', 'normal');

  const generatedAt = input.generatedAt || new Date().toLocaleString();

  pdfH1(doc, `FitFocus — Сравнение прогресса`, `${input.userName}`);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('Фото, замеры и динамика тела по выбранным датам', 14, 36);
  doc.setTextColor(...PDF_COLORS.ink);

  pdfCard(doc, 14, 42, 182, 24);
  pdfSectionTitle(doc, 'Период сравнения', 18, 50);
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`${input.fromLabel} → ${input.toLabel}`, 18, 57);
  doc.text(`Всего фото: ${input.totalPhotos} • Всего замеров: ${input.totalMeasurements}`, 110, 57, { align: 'right' });
  doc.setTextColor(...PDF_COLORS.ink);

  const cardY = 72;
  const cardW = 88;
  const cardH = 42;

  const renderPointCard = (
    x: number,
    y: number,
    title: string,
    label: string,
    weight?: ComparisonValue,
    waist?: ComparisonValue,
    pulse?: ComparisonValue,
    hasPhoto?: boolean,
  ) => {
    pdfCard(doc, x, y, cardW, cardH);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(12);
    doc.text(title, x + 5, y + 7);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(label, x + 5, y + 13);
    doc.setTextColor(...PDF_COLORS.ink);

    doc.setFont('Inter', 'bold');
    doc.setFontSize(9);
    doc.text(`Вес: ${typeof weight === 'number' ? `${weight.toFixed(1)} кг` : '—'}`, x + 5, y + 21);
    doc.text(`Талия: ${typeof waist === 'number' ? `${waist} см` : '—'}`, x + 5, y + 27);
    doc.text(`Пульс: ${typeof pulse === 'number' ? `${pulse} уд/мин` : '—'}`, x + 5, y + 33);
    doc.text(`Фото: ${hasPhoto ? 'есть' : 'нет'}`, x + 5, y + 39);
  };

  renderPointCard(14, cardY, 'Старт', input.fromKey, input.fromWeight, input.fromWaist, input.fromPulse, input.fromPhoto);
  renderPointCard(108, cardY, 'Финиш', input.toKey, input.toWeight, input.toWaist, input.toPulse, input.toPhoto);

  pdfCard(doc, 14, 120, 182, 40);
  pdfSectionTitle(doc, 'Разница между датами', 18, 128);
  autoTable(doc, {
    startY: 132,
    theme: 'plain',
    styles: { font: 'Inter', fontStyle: 'normal', fontSize: 10, cellPadding: 2, textColor: PDF_COLORS.ink },
    headStyles: { font: 'Inter', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: PDF_COLORS.muted },
    head: [['Показатель', 'Изменение']],
    body: [
      ['Вес', formatDelta(input.fromWeight, input.toWeight, 'кг')],
      ['Талия', formatDelta(input.fromWaist, input.toWaist, 'см')],
      ['Пульс', formatDelta(input.fromPulse, input.toPulse, 'уд/мин')],
      ['Фото', input.fromPhoto || input.toPhoto ? 'Есть визуальная история' : 'Нет фото для сравнения'],
    ],
  });

  pdfCard(doc, 14, 165, 182, 34);
  pdfSectionTitle(doc, 'Вывод', 18, 173);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  const summary = [
    typeof input.fromWeight === 'number' && typeof input.toWeight === 'number'
      ? `Вес изменился на ${formatDelta(input.fromWeight, input.toWeight, 'кг')}.`
      : null,
    typeof input.fromWaist === 'number' && typeof input.toWaist === 'number'
      ? `Талия изменилась на ${formatDelta(input.fromWaist, input.toWaist, 'см')}.`
      : null,
    input.fromPhoto || input.toPhoto
      ? 'Сравнение включает фото, чтобы прогресс был виден не только в цифрах.'
      : 'Добавьте фото прогресса, чтобы сравнение стало визуальным.'
  ].filter(Boolean).join(' ');
  doc.text(summary, 18, 180, { maxWidth: 174 });
  doc.setTextColor(...PDF_COLORS.ink);

  pdfFooter(doc, generatedAt);
  doc.save(`FitFocus_Progress_Comparison_${input.fromKey}_to_${input.toKey}.pdf`);
}
