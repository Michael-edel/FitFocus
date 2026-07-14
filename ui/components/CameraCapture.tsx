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
  const streamRef = useRef<MediaStream | null>(null);
  const bootIdRef = useRef(0);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const canShowTorch = useMemo(() => pro && torchAvailable, [pro, torchAvailable]);

  function clearCurrentStream() {
    stopCamera(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function playVideo(video: HTMLVideoElement) {
    try {
      await video.play();
    } catch (error: unknown) {
      if (getErrorName(error) !== "AbortError") throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      await video.play();
    }
  }

  async function boot(nextFacing: CameraFacing, bootId: number) {
    setStarting(true);
    setErr(null);
    try {
      clearCurrentStream();
      const s = await startCamera(nextFacing);
      if (bootId !== bootIdRef.current) {
        stopCamera(s);
        return;
      }

      streamRef.current = s;

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await playVideo(videoRef.current);
      }

      const hasTorch = isTorchSupported(s);
      setTorchAvailable(hasTorch);
      if (hasTorch && torchOn) {
        await setTorch(s, true);
      }
    } catch (e: unknown) {
      if (bootId !== bootIdRef.current) return;
      setErr(formatCameraError(e));
      setTorchAvailable(false);
      setTorchOn(false);
    } finally {
      if (bootId === bootIdRef.current) setStarting(false);
    }
  }

  useEffect(() => {
    if (!open) {
      bootIdRef.current += 1;
      clearCurrentStream();
      setErr(null);
      setTorchAvailable(false);
      setTorchOn(false);
      return;
    }

    const bootId = bootIdRef.current + 1;
    bootIdRef.current = bootId;
    void boot(facing, bootId);
    return () => {
      if (bootId === bootIdRef.current) bootIdRef.current += 1;
      clearCurrentStream();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  async function handleCapture() {
    if (!videoRef.current) return;
    if (!streamRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setErr("Камера ещё не готова. Подождите пару секунд и нажмите «Снять» снова.");
      return;
    }
    try {
      const blob = await capturePhoto(streamRef.current, videoRef.current, "image/jpeg", 0.95);
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      await onCaptured(file);
      onClose();
    } catch {
      setErr("Не удалось сделать фото. Проверьте изображение в окне камеры и попробуйте снова.");
    }
  }

  async function toggleTorch() {
    const next = !torchOn;
    setTorchOn(next);
    const ok = await setTorch(streamRef.current, next);
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

type ErrorRecord = {
  name?: unknown;
  message?: unknown;
};

function getErrorRecord(error: unknown): ErrorRecord {
  return error && typeof error === "object" ? error as ErrorRecord : {};
}

function getErrorName(error: unknown): string {
  const name = getErrorRecord(error).name;
  return typeof name === "string" ? name : "";
}

function getErrorMessage(error: unknown): string {
  const message = getErrorRecord(error).message;
  return typeof message === "string" ? message : "";
}

export function formatCameraError(error: unknown) {
  const name = getErrorName(error);
  const message = getErrorMessage(error);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Нет доступа к камере. Разрешите камеру для FitFocus в настройках браузера или приложения.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Камера не найдена на этом устройстве.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Камера занята другим приложением или браузером.";
  }
  if (name === "AbortError" || /abort/i.test(message)) {
    return "Камера не успела запуститься. Закройте окно и нажмите «Снять» ещё раз.";
  }
  if (message === "Камера не поддерживается этим браузером" || message === "Не удалось открыть камеру") {
    return message;
  }
  return "Не удалось открыть камеру. Проверьте доступ к камере и попробуйте снова.";
}
