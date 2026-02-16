import React, { useEffect, useRef, useState } from "react";
import {
  startCamera,
  stopCamera,
  captureToBlob,
  type CameraFacing,
} from "../../services/camera";

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptured: (file: File) => void;
};

/**
 * CameraCapture
 * - Live preview via getUserMedia
 * - Toggle front/back
 * - Capture to JPEG File (then reuse your existing photo pipeline)
 * - Includes fallback file input with capture="environment"
 */
export default function CameraCapture({ open, onClose, onCaptured }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function init() {
    setError(null);
    try {
      const stream = await startCamera(facing);
      streamRef.current = stream;

      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
    } catch (e: any) {
      setError(e?.message ?? "Camera error");
    }
  }

  function cleanup() {
    stopCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }
    init();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  async function onShot() {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      const blob = await captureToBlob(videoRef.current, "image/jpeg", 0.92);
      const file = new File([blob], `fitfocus_${Date.now()}.jpg`, { type: blob.type });
      onCaptured(file);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="w-[min(96vw,520px)] rounded-2xl overflow-hidden bg-zinc-950 border border-white/10">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="text-white font-semibold">Камера</div>
          <button className="text-white/70 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full aspect-[3/4] object-cover bg-black"
          />
          {error && (
            <div className="absolute inset-0 p-4 text-sm text-red-200 bg-black/70">
              <div className="font-semibold">Не удалось открыть камеру</div>
              <div className="mt-2">{error}</div>
              <div className="mt-3 text-white/70">
                Используйте “Загрузить фото” ниже или откройте сайт в Chrome.
              </div>
            </div>
          )}
        </div>

        <div className="p-4 flex gap-3 justify-between">
          <button
            className="px-4 py-2 rounded-xl bg-white/10 text-white"
            onClick={() => setFacing((v) => (v === "environment" ? "user" : "environment"))}
            disabled={busy}
          >
            Переключить
          </button>

          <button
            className="px-5 py-2 rounded-xl bg-orange-500 text-black font-semibold disabled:opacity-60"
            onClick={onShot}
            disabled={busy || !!error}
          >
            {busy ? "..." : "Снять"}
          </button>
        </div>

        <div className="px-4 pb-4">
          <label className="block text-xs text-white/50 mb-2">Если камера не открывается:</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="block w-full text-white/70"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onCaptured(f);
                onClose();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
