export type CameraFacing = "user" | "environment";

type ImageCaptureConstructor = new (track: MediaStreamTrack) => {
  takePhoto: () => Promise<Blob>;
};

type WindowWithImageCapture = Window & typeof globalThis & {
  ImageCapture?: ImageCaptureConstructor;
};

type TorchCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
};

type TorchConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
};

export async function startCamera(facing: CameraFacing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Камера не поддерживается этим браузером");
  }

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { ideal: facing },
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ];

  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Не удалось открыть камеру");
}

export function stopCamera(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export async function captureToBlob(
  videoEl: HTMLVideoElement,
  mimeType: string = "image/jpeg",
  quality: number = 0.95
): Promise<Blob> {
  const w = videoEl.videoWidth || 1280;
  const h = videoEl.videoHeight || 720;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(videoEl, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      mimeType,
      quality
    );
  });

  return blob;
}

/**
 * Some browsers support ImageCapture.takePhoto(), which can yield better quality.
 * Falls back to canvas capture.
 */
export async function capturePhoto(
  stream: MediaStream | null,
  videoEl: HTMLVideoElement,
  mimeType: string = "image/jpeg",
  quality: number = 0.95
): Promise<Blob> {
  try {
    const w = window as WindowWithImageCapture;
    if (w.ImageCapture && stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        const ic = new w.ImageCapture(track);
        const blob: Blob = await ic.takePhoto();
        // Some browsers return image/jpeg by default.
        if (blob && blob.size > 0) return blob;
      }
    }
  } catch {
    // ignore and fallback
  }
  return captureToBlob(videoEl, mimeType, quality);
}

export function isTorchSupported(stream: MediaStream | null): boolean {
  try {
    const track = stream?.getVideoTracks?.()[0];
    if (!track || !track.getCapabilities) return false;
    const caps = track.getCapabilities() as TorchCapabilities;
    return !!caps?.torch;
  } catch {
    return false;
  }
}

export async function setTorch(stream: MediaStream | null, on: boolean): Promise<boolean> {
  try {
    const track = stream?.getVideoTracks?.()[0];
    if (!track || !track.applyConstraints) return false;
    const torchConstraint: TorchConstraintSet = { torch: on };
    const constraints: MediaTrackConstraints = { advanced: [torchConstraint] };
    await track.applyConstraints(constraints);
    return true;
  } catch {
    return false;
  }
}
