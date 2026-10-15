import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareWisCard } from '../features/dashboard/shareWisCard';

describe('WIS card sharing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the system share sheet when it supports PNG files', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { canShare: vi.fn(() => true), share });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    const toBlob = (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }));
    const result = await shareWisCard({
      card: {} as HTMLElement,
      wis: 74,
      waitForFonts: async () => undefined,
      render: async () => ({ toBlob } as unknown as HTMLCanvasElement),
    });
    expect(result).toBe('share_sheet');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'FitFocus WIS' }));
  });

  it('does not hand off a rendered card after its account session changes', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { canShare: vi.fn(() => true), share });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    const toBlob = (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' }));
    let currentSession = true;

    await expect(shareWisCard({
      card: {} as HTMLElement,
      wis: 74,
      waitForFonts: async () => undefined,
      isCurrentSession: () => currentSession,
      render: async () => {
        currentSession = false;
        return { toBlob } as unknown as HTMLCanvasElement;
      },
    })).rejects.toThrow('share_session_changed');

    expect(share).not.toHaveBeenCalled();
  });
});
