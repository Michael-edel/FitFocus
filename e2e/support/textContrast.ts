import type { Locator } from '@playwright/test';

/** Composite translucent CSS backgrounds before measuring ordinary text contrast. */
export async function textContrast(locator: Locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const color = (value: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).map((n, i) => i === 3 ? n / 255 : n);
    };
    const over = (front: number[], back: number[]) => front.slice(0, 3)
      .map((n, i) => n * front[3] + back[i] * (1 - front[3])).concat(1);
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
    const background = chain.reduce((back, node) => over(color(getComputedStyle(node).backgroundColor), back), [255, 255, 255, 1]);
    const style = getComputedStyle(element);
    const foreground = over(color(style.color), background);
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(n => {
      const value = n / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const a = luminance(background), b = luminance(foreground);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground, background,
      opacity: style.opacity, theme: document.documentElement.dataset.ffTheme };
  });
}
