import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Clock3, ShieldCheck, Sparkles, X } from 'lucide-react';
import { APP_VERSION_LABEL, versioningLayers, versioningRules } from './versioning';
import { formatReleaseTitle, releaseNotes } from './releaseNotes';

type VersionInfoModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function VersionInfoModal({ open, onClose }: VersionInfoModalProps) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchLastX = useRef<number | null>(null);
  const touchLastY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const current = releaseNotes.find((item) => item.isCurrent) ?? releaseNotes[0];
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchLastX.current = touch.clientX;
    touchLastY.current = touch.clientY;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return;
    touchLastX.current = event.touches[0]?.clientX ?? touchLastX.current;
    touchLastY.current = event.touches[0]?.clientY ?? touchLastY.current;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current == null || touchLastX.current == null || touchStartY.current == null || touchLastY.current == null) {
      touchStartX.current = null;
      touchStartY.current = null;
      touchLastX.current = null;
      touchLastY.current = null;
      return;
    }

    const deltaX = touchLastX.current - touchStartX.current;
    const deltaY = Math.abs(touchLastY.current - touchStartY.current);
    const isHorizontalSwipe = Math.abs(deltaX) > 70 && deltaY < 120;
    if (isHorizontalSwipe) onClose();

    touchStartX.current = null;
    touchStartY.current = null;
    touchLastX.current = null;
    touchLastY.current = null;
  };

  return (
    <div className="fixed inset-0 z-[2200] bg-black/70 backdrop-blur-xl flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 z-0 cursor-default"
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-slate-800 bg-slate-950/95 shadow-2xl shadow-black/50 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="sticky top-0 z-10 border-b border-slate-800/80 bg-slate-950/95 px-5 py-4 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                <Sparkles size={12} className="text-indigo-400" />
                Что нового
              </div>
              <h2 className="mt-1 text-xl sm:text-2xl font-black text-white tracking-tight">{APP_VERSION_LABEL}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">Версия приложения, автоматическая сборка main и схема изменений, которую видит и пользователь, и команда.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-800"
            >
              <X size={14} />
              Закрыть
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {versioningLayers.map((layer) => (
              <div key={layer.title} className="rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{layer.title}</div>
                <div className="mt-2 text-lg font-black text-white">{layer.value}</div>
                <div className="mt-1 text-sm font-semibold text-slate-400">{layer.note}</div>
              </div>
            ))}
          </section>

          <section className="rounded-[1.75rem] border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              <ShieldCheck size={12} className="text-emerald-400" />
              Правила версий
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {versioningRules.map((rule) => (
                <div key={rule.title} className="rounded-[1.25rem] border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-black text-white">{rule.title}</div>
                    <Clock3 size={14} className="text-slate-500" />
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-400 leading-relaxed">{rule.description}</div>
                  <ul className="mt-3 space-y-1 text-xs font-semibold text-slate-500">
                    {rule.examples.map((example) => (
                      <li key={example} className="flex items-start gap-2">
                        <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-indigo-400" />
                        <span>{example}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              <Sparkles size={12} className="text-indigo-400" />
              Последний релиз
            </div>
            <div className="mt-3 rounded-[1.25rem] border border-indigo-500/20 bg-indigo-500/8 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-indigo-500/20 bg-indigo-500/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-200">
                  {current.isCurrent ? APP_VERSION_LABEL : `v${current.version} ${current.label}`}
                </span>
                <span className="text-xs font-semibold text-slate-500">{current.date}</span>
              </div>
              <h3 className="mt-3 text-lg font-black text-white">{formatReleaseTitle(current)}</h3>
              <p className="mt-2 text-sm font-semibold text-slate-300 leading-relaxed">{current.summary}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {current.groups.map((group) => (
                  <div key={group.title} className="rounded-[1.1rem] border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-sm font-black text-white">{group.title}</div>
                    <ul className="mt-2 space-y-2 text-sm font-semibold text-slate-400 leading-relaxed">
                      {group.items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
