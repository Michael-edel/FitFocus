import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressFoodPhoto } from '../services/foodPhoto';

const jpegResult = 'data:image/jpeg;base64,anBlZw==';

function mockPhotoBrowser() {
  const bitmap = { width: 1200, height: 900, close: vi.fn() };
  const decode = vi.fn(async () => bitmap);
  const alert = vi.fn();
  const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
  const toBlob = vi.fn((callback: BlobCallback, _type?: string, _quality?: number) => {
    queueMicrotask(() => callback(jpeg));
  });
  const toDataURL = vi.fn(() => { throw new Error('JPEG encoding must be asynchronous'); });
  const drawImage = vi.fn();

  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('alert', alert);
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => ({ drawImage }), toBlob, toDataURL }),
  });
  vi.stubGlobal('FileReader', class {
    result: string | null = null;
    onload?: () => void;
    readAsDataURL() {
      queueMicrotask(() => {
        this.result = jpegResult;
        this.onload?.();
      });
    }
  });

  return { bitmap, decode, alert, toBlob, toDataURL, drawImage };
}

afterEach(() => vi.unstubAllGlobals());

describe('food photo compression', () => {
  it('decodes a supported HEIC once and encodes both JPEG outputs asynchronously', async () => {
    const { bitmap, decode, alert, toBlob, toDataURL, drawImage } = mockPhotoBrowser();
    const file = new File(['photo'], 'image.heic', { type: 'image/heic' });

    await expect(compressFoodPhoto(file, { quality: 0.65 })).resolves.toEqual({
      dataUrl: jpegResult, thumbUrl: jpegResult, base64: 'anBlZw==',
    });
    expect(decode).toHaveBeenCalledExactlyOnceWith(file);
    expect(drawImage).toHaveBeenNthCalledWith(1, bitmap, 0, 0);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(toBlob).toHaveBeenNthCalledWith(1, expect.any(Function), 'image/jpeg', 0.65);
    expect(toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), 'image/jpeg', 0.73);
    expect(toDataURL).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('warns once and uses no JPEG encoder when HEIF decoding fails', async () => {
    const { decode, alert, toBlob } = mockPhotoBrowser();
    const error = new Error('Unsupported HEIF');
    const file = new File(['photo'], 'image.HEIF');
    decode.mockRejectedValueOnce(error);

    await expect(compressFoodPhoto(file)).rejects.toBe(error);
    expect(decode).toHaveBeenCalledExactlyOnceWith(file);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('rejects if the browser cannot create the JPEG blob', async () => {
    const { bitmap, toBlob } = mockPhotoBrowser();
    toBlob.mockImplementationOnce((callback) => queueMicrotask(() => callback(null)));

    await expect(compressFoodPhoto(new File(['photo'], 'image.jpeg'))).rejects.toThrow('Failed to encode JPEG');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
