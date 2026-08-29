import type jsPDF from 'jspdf';

type RoundedPdf = jsPDF & {
  roundedRect?: (x: number, y: number, width: number, height: number, rx: number, ry: number, style?: string) => jsPDF;
};

type AutoTableState = { finalY?: number };
type AutoTablePdf = jsPDF & { lastAutoTable?: AutoTableState | false };

// FIX: Explicitly typed as tuples [number, number, number] to allow safe spread operator use in jsPDF methods.
export const PDF_COLORS = {
  ink: [15, 23, 42] as [number, number, number],          // Slate-900
  muted: [100, 116, 139] as [number, number, number],     // Slate-500
  line: [226, 232, 240] as [number, number, number],      // Slate-200
  card: [255, 255, 255] as [number, number, number],      // White cards
  brand: [99, 102, 241] as [number, number, number],      // Indigo-500 (UI accent)
  header: [15, 23, 42] as [number, number, number],       // Slate-900
  page: [248, 250, 252] as [number, number, number],      // Very light slate tint
};

export function pdfPaintBackground(doc: jsPDF) {
  // Легкий фоновый оттенок всей страницы
  doc.setFillColor(...PDF_COLORS.page);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(...PDF_COLORS.ink);
}

export function pdfHeader(doc: jsPDF, left: string, right?: string) {
  // Темная верхняя панель шапки
  doc.setFillColor(...PDF_COLORS.header);
  doc.rect(0, 0, 210, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(16);
  doc.text(left, 14, 18);

  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  if (right) doc.text(right, 196, 22, { align: 'right' });

  // Акцентная линия цвета Indigo
  doc.setFillColor(...PDF_COLORS.brand);
  doc.rect(0, 30, 210, 3, 'F');

  doc.setTextColor(...PDF_COLORS.ink);
}

export function pdfH1(doc: jsPDF, left: string, right?: string) {
  pdfPaintBackground(doc);
  pdfHeader(doc, left, right);
}

export function pdfCard(doc: jsPDF, x: number, y: number, w: number, h: number) {
  // Чистая белая карточка с тонкой границей
  doc.setFillColor(...PDF_COLORS.card);
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.3);
  const roundedDoc = doc as RoundedPdf;
  if (roundedDoc.roundedRect) roundedDoc.roundedRect(x, y, w, h, 5, 5, 'FD');
  else doc.rect(x, y, w, h, 'FD');
}

export function pdfSectionTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(12);
  doc.text(title, x, y);
  doc.setFont('Inter', 'normal');
}

export function pdfFooter(doc: jsPDF, generatedAt: string) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`Generated: ${generatedAt}`, 14, 292);
    doc.text(`Page ${i} of ${pageCount}`, 196, 292, { align: 'right' });
    doc.setTextColor(...PDF_COLORS.ink);
  }
}

export function pdfLastAutoTableY(doc: jsPDF, fallback: number): number {
  const table = (doc as AutoTablePdf).lastAutoTable;
  const finalY = table && typeof table === 'object' ? table.finalY : undefined;
  return typeof finalY === 'number' && Number.isFinite(finalY) ? finalY : fallback;
}
