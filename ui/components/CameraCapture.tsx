import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  capturePhoto,
  isTorchSupported,
  setTorch,
  startCamera,
  stopCamera,
  type CameraFacing,
} from "../../services/camera";
import { useModalDismissGestures } from "../../useModalDismissGestures";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Returns a File that matches what the existing upload pipeline expects. */
  onCaptured: (file: File) => void | Promise<void>;
  /** If true, shows PRO-only controls like torch/flash (when supported by device). */
  pro?: boolean;
  facing: CameraFacing;
  onFacingChange: (next: CameraFacing) => void;
};

export default function CameraCapture({ open, onClose, onCaptured, pro, facing, onFacingChange }: Props) {
  const dismissGestures = useModalDismissGestures(onClose);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const canShowTorch = useMemo(() => pro && torchAvailable, [pro, torchAvailable]);

  async function boot(nextFacing: CameraFacing) {
    setStarting(true);
    setErr(null);
    try {
      stopCamera(stream);
      const s = await startCamera(nextFacing);
      setStream(s);

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }

      const hasTorch = isTorchSupported(s);
      setTorchAvailable(hasTorch);
      if (hasTorch && torchOn) {
        await setTorch(s, true);
      }
    } catch (e: any) {
      setErr(e?.message || "Не удалось открыть камеру");
      setTorchAvailable(false);
      setTorchOn(false);
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!open) {
      stopCamera(stream);
      setStream(null);
      setErr(null);
      setTorchAvailable(false);
      setTorchOn(false);
      return;
    }

    boot(facing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    boot(facing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  async function handleCapture() {
    if (!videoRef.current) return;
    try {
      const blob = await capturePhoto(stream, videoRef.current, "image/jpeg", 0.95);
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      await onCaptured(file);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Не удалось сделать фото");
    }
  }

  async function toggleTorch() {
    const next = !torchOn;
    setTorchOn(next);
    const ok = await setTorch(stream, next);
    if (!ok) setTorchOn(!next);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-[680px] rounded-2xl bg-[#0b1220] shadow-2xl touch-pan-y" {...dismissGestures}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold text-white">Камера</div>
          <button
            className="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="p-4">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              className="h-[420px] w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white/80">
                Открываю камеру…
              </div>
            )}
          </div>

          {err && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {err}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                onClick={() => onFacingChange(facing === "environment" ? "user" : "environment")}
                disabled={starting}
              >
                Переключить камеру
              </button>

              {canShowTorch && (
                <button
                  className={
                    "rounded-xl px-4 py-2 text-sm text-white hover:bg-white/15 " +
                    (torchOn ? "bg-yellow-500/20" : "bg-white/10")
                  }
                  onClick={toggleTorch}
                  disabled={starting}
                  title="Подсветка (если поддерживается устройством)"
                >
                  {torchOn ? "Подсветка: ВКЛ" : "Подсветка: ВЫКЛ"}
                </button>
              )}

              {!pro && torchAvailable && (
                <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">
                  Подсветка доступна в PRO
                </div>
              )}
            </div>

            <button
              className="rounded-xl bg-[#5b5cf6] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              onClick={handleCapture}
              disabled={starting}
            >
              Снять
            </button>
          </div>

          <div className="mt-3 text-xs text-white/50">
            Совет: лучшее качество — при хорошем свете и без движения.
          </div>
        </div>
      </div>
    </div>
  );
}
