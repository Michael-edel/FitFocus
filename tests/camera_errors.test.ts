import { describe, expect, it } from 'vitest';
import { formatCameraError } from '../ui/components/CameraCapture';

describe('camera error formatting', () => {
  it('maps browser abort errors to a Russian user-facing message', () => {
    const message = formatCameraError(new DOMException('The operation was aborted.', 'AbortError'));

    expect(message).toBe('Камера не успела запуститься. Закройте окно и нажмите «Снять» ещё раз.');
    expect(message).not.toContain('The operation was aborted');
  });

  it('does not expose unknown raw browser error text', () => {
    const message = formatCameraError({ name: 'UnknownError', message: 'Internal device stack trace' });

    expect(message).toBe('Не удалось открыть камеру. Проверьте доступ к камере и попробуйте снова.');
    expect(message).not.toContain('Internal device stack trace');
  });

  it('keeps known local camera support errors readable', () => {
    expect(formatCameraError(new Error('Камера не поддерживается этим браузером'))).toBe(
      'Камера не поддерживается этим браузером',
    );
  });
});
