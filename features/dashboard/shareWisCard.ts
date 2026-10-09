export type WisShareMethod = 'share_sheet' | 'download';

/** Renders a WIS DOM card to PNG and uses the platform share sheet when it supports files. */
export async function shareWisCard(input: {
  card: HTMLElement;
  wis: number;
  waitForFonts: () => Promise<void>;
  render?: (card: HTMLElement) => Promise<HTMLCanvasElement>;
}): Promise<WisShareMethod> {
  const { card, wis, waitForFonts } = input;
  const html2canvasModule = input.render ? null : await import('html2canvas');
  await waitForFonts();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const canvas = input.render
    ? await input.render(card)
    : await html2canvasModule!.default(card, { useCORS: true, scale: 1, backgroundColor: null });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('canvas_to_blob_failed');
  const file = new File([blob], `FitFocus_WIS_${wis}.png`, { type: 'image/png' });
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  if (canShareFiles) {
    await navigator.share({ files: [file], title: 'FitFocus WIS', text: 'Моя недельная WIS-карточка FitFocus' });
    return 'share_sheet';
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `FitFocus_WIS_${wis}.png`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return 'download';
}