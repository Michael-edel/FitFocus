export type ImageQualityInfo = {
  width: number;
  height: number;
  sizeKB: number;
  suspectedMessengerCompression: boolean;
  reasons: string[];
};

// Heuristic detector for messenger-compressed photos (WhatsApp/Telegram/etc.)
// We avoid EXIF parsing to keep it lightweight; canvas re-encode often strips EXIF anyway.
export async function analyzeImageQuality(file: File): Promise<ImageQualityInfo> {
  const sizeKB = Math.round(file.size / 1024);
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });

  const width = img.width;
  const height = img.height;

  const longSide = Math.max(width, height);
  const reasons: string[] = [];

  // WhatsApp "photo" send often lands around <=1600px long side, and <~400KB for many scenes
  if (longSide <= 1600) reasons.push("низкое разрешение (<=1600px)");
  if (sizeKB <= 400) reasons.push("маленький размер файла (<=400KB)");
  if (file.type === "image/jpeg" || file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg")) {
    reasons.push("JPEG перекодирование");
  }

  const suspectedMessengerCompression = (longSide <= 1600 && sizeKB <= 400);

  URL.revokeObjectURL(url);

  return { width, height, sizeKB, suspectedMessengerCompression, reasons };
}
