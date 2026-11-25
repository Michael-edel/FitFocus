export type CompressedPhoto = {
  dataUrl: string;
  thumbUrl: string;
  base64: string;
};

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    image.src = url;
  });
}

async function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Failed to encode JPEG'));
    }, 'image/jpeg', quality);
  });

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read JPEG'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read JPEG'));
    reader.onabort = () => reject(new Error('JPEG read aborted'));
    reader.readAsDataURL(blob);
  });
}

export async function compressFoodPhoto(
  file: File,
  options?: { maxSide?: number; quality?: number; thumbSize?: number },
): Promise<CompressedPhoto> {
  const lowerName = (file.name || '').toLowerCase();
  const isHeic =
    file.type.includes('heic') ||
    file.type.includes('heif') ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif');
  const maxSide = options?.maxSide ?? 768;
  const quality = options?.quality ?? 0.72;
  const thumbSize = options?.thumbSize ?? 140;
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('No canvas context');

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file);
  } catch (error) {
    if (isHeic) {
      alert('Фото в формате HEIC/HEIF. Пожалуйста, выберите JPG/PNG или нажмите «Снять» (камера), чтобы приложение само сделало JPEG.');
      throw error;
    }
    source = await loadImageElement(file);
  }
  const sourceWidth = ('naturalWidth' in source && source.naturalWidth) || source.width;
  const sourceHeight = ('naturalHeight' in source && source.naturalHeight) || source.height;
  try {
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;
    sourceContext.drawImage(source, 0, 0);
  } finally {
    if ('close' in source) source.close();
  }

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas context');
  context.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);

  const thumbnail = document.createElement('canvas');
  thumbnail.width = thumbSize;
  thumbnail.height = thumbSize;
  const thumbnailContext = thumbnail.getContext('2d');
  if (!thumbnailContext) throw new Error('No canvas context');
  const side = Math.min(width, height);
  const sourceX = Math.floor((width - side) / 2);
  const sourceY = Math.floor((height - side) / 2);
  thumbnailContext.drawImage(canvas, sourceX, sourceY, side, side, 0, 0, thumbSize, thumbSize);
  const [dataUrl, thumbUrl] = await Promise.all([
    encodeJpeg(canvas, quality),
    encodeJpeg(thumbnail, Math.min(0.8, quality + 0.08)),
  ]);

  return {
    dataUrl,
    thumbUrl,
    base64: dataUrl.split(',')[1] || '',
  };
}
