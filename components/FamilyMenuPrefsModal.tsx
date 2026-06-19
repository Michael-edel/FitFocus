import React from "react";
import { useModalDismissGestures } from "../useModalDismissGestures";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function FamilyMenuPrefsModal({ open, onClose, title = "Семейные настройки", children }: Props) {
  const dismissGestures = useModalDismissGestures(onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2100] bg-slate-950/70 backdrop-blur-xl grid place-items-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950 shadow-2xl touch-pan-y" {...dismissGestures}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="text-sm font-semibold text-white/90">{title}</div>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/80 hover:bg-white/5"
          >
            Закрыть
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
