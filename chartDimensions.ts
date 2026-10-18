export function initialChartDimension(height: number) {
  const viewportWidth = typeof window === 'undefined' ? 320 : window.innerWidth;
  const horizontalChrome = viewportWidth >= 768 ? 400 : 72;
  return { width: Math.max(1, viewportWidth - horizontalChrome), height };
}
