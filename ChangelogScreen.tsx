import React from 'react';
import { BadgeInfo, CalendarDays, CheckCircle2, History, Sparkles } from 'lucide-react';
import { releaseNotes } from './releaseNotes';
import { APP_VERSION_LABEL, versioningLayers, versioningRules } from './versioning';

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
          Здесь собраны текущая и предыдущие версии FitFocus. Текущая сборка обновляется автоматически при push в main, а списки сгруппированы по задачам, чтобы было проще понять, что уже сделано и что входит в конкретную сборку.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 md:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Схема версий</div>
              <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-100">Как теперь ведем версии в FitFocus</h2>
              <p className="mt-2 max-w-3xl text-slate-400 font-medium leading-7">
                Одна версия отвечает за приложение, отдельно живут версии API, данных и миграций. Так проще понимать, что именно изменилось и где может быть конфликт.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-100">
              <Sparkles className="h-3.5 w-3.5" />
              {APP_VERSION_LABEL}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {versioningLayers.map((layer) => (
              <div key={layer.title} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{layer.title}</div>
                <div className="mt-2 text-2xl font-black text-slate-100">{layer.value}</div>
                <div className="mt-2 text-slate-400 font-medium leading-7">{layer.note}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {versioningRules.map((rule) => (
              <div key={rule.title} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
                  {rule.title}
                </div>
                <div className="mt-3 text-slate-100 font-semibold leading-7">{rule.description}</div>
                <ul className="mt-4 space-y-2 text-slate-400 font-medium leading-6">
                  {rule.examples.map((example) => (
                    <li key={example} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>{example}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

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
