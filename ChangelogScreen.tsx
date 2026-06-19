import React from 'react';
import { BadgeInfo, CalendarDays, CheckCircle2, History, Sparkles } from 'lucide-react';
import { APP_VERSION_LABEL, releaseNotes } from './releaseNotes';

export default function ChangelogScreen() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-3 max-w-4xl">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-100">
          <History className="h-3.5 w-3.5" />
          Что нового
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-100">Изменения по версиям</h1>
        <p className="max-w-3xl text-slate-400 font-medium leading-7">
          Здесь собраны текущая и предыдущие версии FitFocus. Списки сгруппированы по задачам, чтобы было проще понять, что уже сделано и что входит в конкретную сборку.
        </p>
      </div>

      <div className="space-y-6">
        {releaseNotes.map((release) => (
          <section key={`${release.version}-${release.date}`} className={`rounded-[2rem] border p-6 md:p-7 ${release.isCurrent ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                    {APP_VERSION_LABEL}
                  </div>
                  {release.isCurrent && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Текущая
                    </div>
                  )}
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-100">
                  {`Версия ${release.version} ${release.label}`}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {release.date}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeInfo className="h-4 w-4" />
                    {release.summary}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
              {release.groups.map((group) => (
                <div key={group.title} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{group.title}</div>
                  <ul className="mt-4 space-y-3">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-3 text-slate-200 font-medium leading-7">
                        <span className="mt-2 h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
