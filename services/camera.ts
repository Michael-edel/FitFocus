// services/camera.ts
// Camera utilities for PWA/Browser capture (Android Chrome + installed PWA)
// Works over HTTPS. Includes safe defaults & stop helpers.

export type CameraFacing = "user" | "environment";

export function preferredConstraints(facing: CameraFacing): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };
}

export async function startCamera(facing: CameraFacing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not supported");
  }
  return navigator.mediaDevices.getUserMedia(preferredConstraints(facing));
}

export function stopCamera(stream?: MediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

export async function captureToBlob(
  videoEl: HTMLVideoElement,
  mimeType: string = "image/jpeg",
  quality: number = 0.92
): Promise<Blob> {
  const w = videoEl.videoWidth || 1280;
  const h = videoEl.videoHeight || 720;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(videoEl, 0, 0, w, h);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), mimeType, quality)
  );

  if (!blob) throw new Error("Failed to capture photo");
  return blob;
}
