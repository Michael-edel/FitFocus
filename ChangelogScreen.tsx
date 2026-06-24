import React, { useEffect, useMemo, useState } from 'react';
import { BadgeInfo, CalendarDays, CheckCircle2, History, Sparkles } from 'lucide-react';
import { BUILD_SOURCE } from './build-info.generated';
import { formatReleaseTitle, localizeCommitSubject, releaseNotes } from './releaseNotes';
import { APP_VERSION_STRING, APP_VERSION_UI_LABEL, versioningLayers, versioningRules } from './versioning';

type GitHubCommitItem = {
  sha: string;
  commit?: {
    message?: string;
    author?: {
      date?: string;
    };
  };
};

type MainBuildEntry = {
  sha: string;
  shortSha: string;
  committedAt: string;
  sequence: number | null;
  descriptionRu: string;
  isCurrent: boolean;
};

const GITHUB_COMMITS_URL = 'https://api.github.com/repos/Michael-edel/FitFocus/commits?sha=main&per_page=25';
const GITHUB_COUNT_URL = 'https://api.github.com/repos/Michael-edel/FitFocus/commits?sha=main&per_page=1&page=1';
const BUILD_HISTORY_CACHE_KEY = 'fitfocus.build-history.v4';
const BUILD_HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;

function parseLastPage(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getCommitSubject(message?: string): string {
  return String(message || '')
    .split('\n')[0]
    .trim();
}

function buildFallbackEntries(): MainBuildEntry[] {
  const baseCount = BUILD_SOURCE.commitCount > 0 ? BUILD_SOURCE.commitCount : null;
  return (BUILD_SOURCE.recentBuilds || []).map((build, index) => ({
    sha: build.sha || build.shortSha || `fallback-${index}`,
    shortSha: build.shortSha || build.sha?.slice(0, 7) || 'unknown',
    committedAt: build.committedAt || BUILD_SOURCE.builtAt,
    sequence: baseCount ? Math.max(baseCount - index, 1) : null,
    descriptionRu: localizeCommitSubject(build.subject || ''),
    isCurrent: index === 0,
  }));
}

function readCachedEntries(): MainBuildEntry[] | null {
  try {
    const raw = window.localStorage.getItem(BUILD_HISTORY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; entries?: MainBuildEntry[] };
    if (!parsed?.savedAt || !Array.isArray(parsed.entries)) return null;
    if (Date.now() - parsed.savedAt > BUILD_HISTORY_CACHE_TTL_MS) return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

function writeCachedEntries(entries: MainBuildEntry[]) {
  try {
    window.localStorage.setItem(
      BUILD_HISTORY_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        entries,
      }),
    );
  } catch {
    // ignore cache errors
  }
}

async function fetchMainBuildEntries(signal: AbortSignal): Promise<MainBuildEntry[]> {
  const [countResponse, commitsResponse] = await Promise.all([
    fetch(GITHUB_COUNT_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    }),
    fetch(GITHUB_COMMITS_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    }),
  ]);

  if (!countResponse.ok || !commitsResponse.ok) {
    throw new Error('Failed to fetch GitHub build history');
  }

  const totalCommits = parseLastPage(countResponse.headers.get('link'));
  const commits = (await commitsResponse.json()) as GitHubCommitItem[];

  return commits
    .map((item, index) => {
      const subject = getCommitSubject(item.commit?.message);
      const committedAt = item.commit?.author?.date || BUILD_SOURCE.builtAt;
      return {
        sha: item.sha,
        shortSha: item.sha.slice(0, 7),
        committedAt,
        sequence: totalCommits ? Math.max(totalCommits - index, 1) : null,
        descriptionRu: localizeCommitSubject(subject),
        isCurrent: item.sha.startsWith(BUILD_SOURCE.shortSha),
      };
    })
    .filter((entry) => entry.shortSha);
}

function formatBuildLabel(entry: MainBuildEntry) {
  return entry.sequence ? `Сборка main №${entry.sequence}` : `Сборка main • ${entry.shortSha}`;
}

export default function ChangelogScreen() {
  const [mainBuildEntries, setMainBuildEntries] = useState<MainBuildEntry[]>(() => buildFallbackEntries());

  useEffect(() => {
    const cached = readCachedEntries();
    if (cached?.length) {
      setMainBuildEntries(cached);
    }

    const controller = new AbortController();
    fetchMainBuildEntries(controller.signal)
      .then((entries) => {
        if (!entries.length) return;
        setMainBuildEntries(entries);
        writeCachedEntries(entries);
      })
      .catch(() => {
        // keep fallback/cached history
      });

    return () => controller.abort();
  }, []);

  const historicalReleaseNotes = useMemo(
    () => releaseNotes.filter((release) => !release.isCurrent),
    [],
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-3 max-w-4xl">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-100">
          <History className="h-3.5 w-3.5" />
          Что нового
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-100">Изменения по версиям</h1>
        <p className="max-w-3xl text-slate-400 font-medium leading-7">
          Верхний блок показывает каждую отдельную main-сборку после пуша: у каждой есть свой номер, SHA, дата и краткое описание на русском. Ниже остаются более крупные релизные версии продукта, такие как 2.4.0 Бета и 2.3.0 Бета.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 md:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Схема версий</div>
              <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-100">Как теперь ведём версии в FitFocus</h2>
              <p className="mt-2 max-w-3xl text-slate-400 font-medium leading-7">
                Есть два уровня истории: релиз приложения и отдельные main-сборки. Релиз меняется редко, а номер main-сборки увеличивается на 1 с каждым новым коммитом в ветку main, чтобы можно было быстро понять, какой именно код сейчас стоит у тестера.
              </p>
            </div>
            <div className="flex flex-col gap-2 items-start md:items-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-100">
                <Sparkles className="h-3.5 w-3.5" />
                {APP_VERSION_UI_LABEL}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
                {mainBuildEntries[0] ? formatBuildLabel(mainBuildEntries[0]) : `Сборка main • ${BUILD_SOURCE.shortSha}`}
              </div>
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

        {mainBuildEntries.map((entry) => (
          <section
            key={entry.sha}
            className={`rounded-[2rem] border p-6 md:p-7 ${entry.isCurrent ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/60'}`}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                    {formatBuildLabel(entry)}
                  </div>
                  {entry.isCurrent && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Текущая
                    </div>
                  )}
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-100">{formatBuildLabel(entry)}</h2>
                <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {new Date(entry.committedAt).toLocaleString('ru-RU')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <BadgeInfo className="h-4 w-4" />
                    {entry.descriptionRu}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Что изменилось</div>
                <ul className="mt-4 space-y-3">
                  <li className="flex gap-3 text-slate-200 font-medium leading-7">
                    <span className="mt-2 h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                    <span>{entry.descriptionRu}</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Сборка</div>
                <ul className="mt-4 space-y-3">
                  <li className="flex gap-3 text-slate-200 font-medium leading-7">
                    <span className="mt-2 h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                    <span>Номер сборки: {entry.sequence ? `#${entry.sequence}` : 'не определён'}</span>
                  </li>
                  <li className="flex gap-3 text-slate-200 font-medium leading-7">
                    <span className="mt-2 h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                    <span>SHA: {entry.shortSha}</span>
                  </li>
                  <li className="flex gap-3 text-slate-200 font-medium leading-7">
                    <span className="mt-2 h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                    <span>{entry.isCurrent ? 'Это текущая сборка, которая стоит на устройстве.' : 'Это предыдущая main-сборка в истории изменений.'}</span>
                  </li>
                  <li className="flex gap-3 text-slate-200 font-medium leading-7">
                    <span className="mt-2 h-2 w-2 rounded-full bg-indigo-400 shrink-0" />
                    <span>Публичный релиз продукта остаётся {APP_VERSION_STRING}, пока вы сознательно не выпускаете новую версию.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        ))}

        {historicalReleaseNotes.map((release) => (
          <section key={`${release.version}-${release.date}`} className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                    {`v${release.version} ${release.label}`}
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-100">{formatReleaseTitle(release)}</h2>
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
