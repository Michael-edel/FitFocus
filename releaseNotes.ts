import { APP_VERSION_STRING, BUILD_VERSION_LABEL } from './versioning';
import { BUILD_SOURCE } from './build-info.generated';

export type ReleaseNoteGroup = {
  title: string;
  items: readonly string[];
};

export type ReleaseNote = {
  version: string;
  label: string;
  date: string;
  summary: string;
  groups: readonly ReleaseNoteGroup[];
  isCurrent?: boolean;
};

type BuildHistoryItem = {
  sha?: string;
  shortSha?: string;
  committedAt?: string;
  subject?: string;
};

const fallbackMainBuildHistory: readonly BuildHistoryItem[] = [
  {
    shortSha: '881efac',
    committedAt: '2026-06-24T18:55:56+05:00',
    subject: 'Improve Russian main build changelog',
  },
  {
    shortSha: '8263692',
    committedAt: '2026-06-24T18:38:38+05:00',
    subject: 'Localize latest changelog commit label',
  },
  {
    shortSha: '515173c',
    committedAt: '2026-06-24T18:30:56+05:00',
    subject: 'Preserve Russian build history in changelog',
  },
  {
    shortSha: '0ba358d',
    committedAt: '2026-06-24T18:08:33+05:00',
    subject: 'Normalize wearable profile day keys',
  },
  {
    shortSha: 'aaa6a33',
    committedAt: '2026-06-24T17:47:32+05:00',
    subject: 'Implement real feature rollout percentage',
  },
  {
    shortSha: 'e81769e',
    committedAt: '2026-06-24T17:29:26+05:00',
    subject: 'Fix shopping checked scope key',
  },
  {
    shortSha: '3607e1c',
    committedAt: '2026-06-24T17:21:10+05:00',
    subject: 'Harden OAuth state and verified email rules',
  },
  {
    shortSha: '9df01cb',
    committedAt: '2026-06-24T17:14:52+05:00',
    subject: 'Restrict state API and enforce beta access',
  },
  {
    shortSha: '3d4de06',
    committedAt: '2026-06-24T17:08:50+05:00',
    subject: 'Harden Apple OAuth id_token verification',
  },
  {
    shortSha: '222b923',
    committedAt: '2026-06-24T16:39:29+05:00',
    subject: 'Improve changelog build history',
  },
  {
    shortSha: 'd87a223',
    committedAt: '2026-06-24T10:18:23+05:00',
    subject: 'Fix achievement unlock semantics',
  },
  {
    shortSha: '1b9437f',
    committedAt: '2026-06-24T09:18:07+05:00',
    subject: 'Harden achievement MVP',
  },
];

export function localizeCommitSubject(subject: string): string {
  const s = subject.trim();
  if (!s) return 'Коммит без описания';

  const exactMatches: Record<string, string> = {
    'Improve Russian main build changelog': 'Экран версий обновлён: история main-сборок сохраняется и показывается на русском языке',
    'Localize latest changelog commit label': 'Последний коммит в экране версий теперь тоже подписывается по-русски',
    'Localize versioning history labels': 'Подписи истории версий приведены к русскому языку',
    'Improve versioning history labels': 'Улучшены подписи истории версий и разбор main-сборок',
    'Add support ticket lifecycle and client replies': 'Добавлен жизненный цикл обращений и ответы клиента',
    'Validate profile stateItems keyspace': 'Проверена область ключей stateItems в профиле',
    'Add automatic main build versioning': 'Добавлено автоматическое версионирование main-сборки',
    'Add admin route guard check': 'Добавлена проверка admin для /api/admin/*',
    'Fix AI identity key and migration version': 'Исправлены ключ идентификации AI и версия миграции',
    'Remove test-mode plan bypass': 'Убран обход тарифа в тестовом режиме',
    'Preserve recipe ingredient amounts': 'Сохранены граммовки ингредиентов в рецептах',
    'Localize changelog build labels': 'Подписи сборки и changelog переведены на русский',
    'Add day-aware nutrition diary stats': 'Дневник питания стал учитывать выбранный день',
    'Fix account deletion D1 cleanup': 'Исправлена очистка D1 при удалении аккаунта',
    'Fix day grouping and shopping list rendering': 'Исправлены группировка по дням и корзина закупа',
    'Compact pro screen on mobile': 'Уплотнён экран Pro на мобильных',
    'Default nutrition diary to today': 'Дневник питания теперь открывается на сегодняшнем дне',
    'Remove duplicate profile helpers': 'Удалены дублирующиеся вспомогательные функции профиля',
    'Deduplicate profiles by email first': 'Профили сначала объединяются по email',
    'Localize version labels and release notes': 'Подписи версий и релиз-ноты переведены на русский',
    'Store support attachments in R2': 'Вложения обращений вынесены в R2',
    'Fix achievement unlock semantics': 'Исправлена логика открытия достижений по реальным действиям пользователя',
    'Harden achievement MVP': 'Усилена стабильность MVP достижений и очереди popup-уведомлений',
    'Sync D1 schema with latest migrations': 'Схема D1 синхронизирована с актуальными миграциями',
    'Add achievement engine MVP': 'Добавлен базовый движок достижений и первый каталог наград',
    'Harden profile PUT merge behavior': 'Защищено merge-поведение PUT профиля без потери существующих данных',
    'Normalize wearable history day keys': 'История данных со смарт-часов переведена на локальные ключи дня',
    'Sanitize AI event logs': 'AI-логи очищены от чувствительных пользовательских данных',
    'Fix active plan expiration checks': 'Проверки активного тарифа теперь учитывают окончание периода подписки',
    'Normalize wearable profile day keys': 'Нормализованы локальные ключи дня для wearable-метрик профиля',
    'Preserve Russian build history in changelog': 'Сохранена русская история main-сборок в экране версий',
    'Implement real feature rollout percentage': 'Реализован настоящий процентный rollout для feature flags',
    'Fix shopping checked scope key': 'Исправлен scope key для отмеченных товаров в корзине закупа',
    'Harden OAuth state and verified email rules': 'Усилены правила OAuth state и проверки подтверждённого email',
    'Restrict state API and enforce beta access': 'Ограничен доступ к state API и включена жёсткая проверка beta access',
    'Harden Apple OAuth id_token verification': 'Усилена серверная проверка Apple OAuth id_token',
    'Improve changelog build history': 'Улучшен экран версий и история main-сборок',
  };

  if (exactMatches[s]) {
    return exactMatches[s];
  }

  const normalized = s
    .replace(/^Add\s+/i, 'Добавлено: ')
    .replace(/^Fix\s+/i, 'Исправлено: ')
    .replace(/^Update\s+/i, 'Обновлено: ')
    .replace(/^Improve\s+/i, 'Улучшено: ')
    .replace(/^Implement\s+/i, 'Реализовано: ')
    .replace(/^Harden\s+/i, 'Усилено: ')
    .replace(/^Normalize\s+/i, 'Нормализовано: ')
    .replace(/^Preserve\s+/i, 'Сохранено: ')
    .replace(/^Support\s+/i, 'Поддержка: ')
    .replace(/^Remove\s+/i, 'Удалено: ')
    .replace(/^Refactor\s+/i, 'Рефакторинг: ')
    .replace(/\bachievement\b/gi, 'достижение')
    .replace(/\bachievements\b/gi, 'достижения')
    .replace(/\bapple\b/gi, 'Apple')
    .replace(/\bauth\b/gi, 'авторизация')
    .replace(/\bbeta access\b/gi, 'beta access')
    .replace(/\bautomatic\b/gi, 'автоматическое')
    .replace(/\bautomatically\b/gi, 'автоматически')
    .replace(/\bmain build changelog\b/gi, 'история main-сборок в экране версий')
    .replace(/\blatest changelog commit label\b/gi, 'подпись последнего коммита в экране версий')
    .replace(/\bversioning history labels\b/gi, 'подписи истории версий')
    .replace(/\bsupport ticket lifecycle\b/gi, 'жизненный цикл обращений')
    .replace(/\bclient replies\b/gi, 'ответы клиента')
    .replace(/\bstateitems keyspace\b/gi, 'область ключей stateItems')
    .replace(/\bbuild history\b/gi, 'история сборок')
    .replace(/\bbuild\b/gi, 'сборка')
    .replace(/\bbuild history\b/gi, 'история сборок')
    .replace(/\bchangelog\b/gi, 'экран версий')
    .replace(/\bcommit\b/gi, 'коммит')
    .replace(/\bcurrent\b/gi, 'текущий')
    .replace(/\bfeature rollout percentage\b/gi, 'процентный rollout feature-флагов')
    .replace(/\bfeature rollout\b/gi, 'rollout feature-флагов')
    .replace(/\bfeature flags\b/gi, 'feature-флаги')
    .replace(/\bfamily\b/gi, 'семья')
    .replace(/\bgoogle\b/gi, 'Google')
    .replace(/\bid_token\b/gi, 'id_token')
    .replace(/\blatest\b/gi, 'последний')
    .replace(/\blabel\b/gi, 'подпись')
    .replace(/\bversioning\b/gi, 'версионирование')
    .replace(/\bversion\b/gi, 'версия')
    .replace(/\boauth\b/gi, 'OAuth')
    .replace(/\bprofile\b/gi, 'профиль')
    .replace(/\brussian\b/gi, 'русский')
    .replace(/\bscope key\b/gi, 'scope key')
    .replace(/\bshopping checked\b/gi, 'отмеченные покупки')
    .replace(/\bstate api\b/gi, 'state API')
    .replace(/\bverified email\b/gi, 'подтверждённый email')
    .replace(/\bwearable\b/gi, 'wearable')
    .replace(/\bmain\b/gi, 'main')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized === s) {
    return `Коммит: ${s}`;
  }
  return normalized;
}

function formatReleaseTitle(release: ReleaseNote): string {
  if (release.isCurrent) {
    return BUILD_VERSION_LABEL;
  }
  return `Версия ${release.version} ${release.label}`;
}

function formatBuildHistoryLine(build: BuildHistoryItem): string {
  const date = build.committedAt
    ? new Date(build.committedAt).toLocaleString('ru-RU')
    : 'Дата коммита недоступна';
  const title = localizeCommitSubject(build.subject || '');
  const sha = build.shortSha || build.sha?.slice(0, 8) || 'unknown';
  return `${date} · ${sha} — ${title}`;
}

function mergeRecentBuildHistory(limit = 12): readonly BuildHistoryItem[] {
  const merged = [...(BUILD_SOURCE.recentBuilds || []), ...fallbackMainBuildHistory];
  const deduped = new Map<string, BuildHistoryItem>();

  for (const build of merged) {
    const key = build.sha || build.shortSha || `${build.committedAt || ''}:${build.subject || ''}`;
    if (!key || deduped.has(key)) continue;
    deduped.set(key, build);
  }

  return [...deduped.values()]
    .sort((a, b) => {
      const aTime = a.committedAt ? new Date(a.committedAt).getTime() : 0;
      const bTime = b.committedAt ? new Date(b.committedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}

const mergedRecentBuilds = mergeRecentBuildHistory();
const topBuild = mergedRecentBuilds[0];
const buildShortSha = topBuild?.shortSha || BUILD_SOURCE.shortSha;
const buildCommittedAt = topBuild?.committedAt || BUILD_SOURCE.builtAt;

const currentBuildReleaseNote: ReleaseNote = {
  version: APP_VERSION_STRING,
  label: 'main',
  date: new Date(buildCommittedAt).toLocaleDateString('ru-RU'),
  summary: String(BUILD_SOURCE.branch) === 'main'
    ? 'Сборка main обновляется автоматически при каждом пуше. Релизная версия продукта меняется отдельно, а ниже показаны номер текущей сборки, SHA, последние изменения и схема версионирования.'
    : `Автоматическая сборка ветки ${BUILD_SOURCE.branch}.`,
  isCurrent: true,
  groups: [
    {
      title: 'Как читать номера',
      items: [
        `Версия приложения: ${APP_VERSION_STRING} — это номер релиза, он меняется только при осознанном выпуске новой версии.`,
        `Сборка main: ${BUILD_SOURCE.commitCount > 0 ? `№${BUILD_SOURCE.commitCount}` : buildShortSha} — это номер текущего пуша/деплоя; он увеличивается на 1 при каждом новом коммите в main.`,
        'API, данные и миграции версионируются отдельно, чтобы можно было обновлять приложение без поломки старых клиентов и базы.',
      ],
    },
    {
      title: 'Что изменилось',
      items: [
        'Каждый новый пуш в main получает отдельную сборку с собственным SHA и временем публикации.',
        'История последних деплоев показывается ниже отдельным списком и больше не затирает релизные карточки от 19.06 и прошлых дат.',
        'Подписи и краткие описания текущих изменений выводятся на русском, чтобы тестерам не приходилось расшифровывать subject коммитов вручную.',
      ],
    },
    {
      title: 'Последние main-сборки',
      items: mergedRecentBuilds.length
        ? mergedRecentBuilds.map((build) => formatBuildHistoryLine(build))
        : BUILD_SOURCE.recentCommits.length
          ? BUILD_SOURCE.recentCommits.map((commit) => localizeCommitSubject(commit))
          : ['История сборок недоступна в этой сборке.'],
    },
    {
      title: 'Ключевые изменения текущего деплоя',
      items: BUILD_SOURCE.recentCommits.length
        ? BUILD_SOURCE.recentCommits
            .slice(0, 5)
            .map((commit) => localizeCommitSubject(commit))
        : ['История коммитов недоступна в этой сборке.'],
    },
    {
      title: 'Сборка',
      items: [
        `Ветка: ${BUILD_SOURCE.branch}`,
        `Текущий SHA: ${buildShortSha}`,
        `Время сборки: ${new Date(BUILD_SOURCE.builtAt).toLocaleString('ru-RU')}`,
        `Показано последних main-сборок: ${mergedRecentBuilds.length}`,
      ],
    },
  ],
};

export const releaseNotes: ReleaseNote[] = [
  currentBuildReleaseNote,
  {
    version: "2.4.0",
    label: "Бета",
    date: "19.06.2026",
    summary: "Добавили форму поддержки с голосом, вложениями и списком обращений в админке.",
    groups: [
      {
        title: "Новое",
        items: [
          "Вкладка «Поддержка» с отправкой текста, фото, видео и голосового сообщения.",
          "Обращения сохраняются в D1 и видны в Admin Console с вложениями и метаданными.",
          "Кнопка версии теперь открывает экран «Что нового» и на desktop, и на телефоне.",
        ],
      },
      {
        title: "Для теста",
        items: [
          "Можно быстро проверить, как пользователь сообщает об ошибке с экрана телефона.",
          "Группировка задач по версиям помогает отделять текущую сборку от предыдущих.",
        ],
      },
    ],
  },
  {
    version: "2.3.0",
    label: "Бета",
    date: "18.06.2026",
    summary: "Сделали упор на стабильность облачной синхронизации и хранение профиля между устройствами.",
    groups: [
      {
        title: "Облако",
        items: [
          "Профиль синхронизируется между компьютером и iPhone через cloud profile.",
          "Добавлены проверки конфликтов версий и восстановление после ошибок.",
          "Сессионные данные и профиль учитывают версию записи при сохранении.",
        ],
      },
      {
        title: "UX",
        items: [
          "На экране онбординга и в настройках стали заметнее статусы синхронизации.",
          "Фокус сделали на понятных действиях: сохранить, синхронизировать, восстановить из облака.",
        ],
      },
    ],
  },
  {
    version: "2.2.0",
    label: "Бета",
    date: "17.06.2026",
    summary: "Доработали AI Council, планы питания и прогресс, чтобы данные было проще читать и сравнивать.",
    groups: [
      {
        title: "AI и планы",
        items: [
          "AI Совет использует роли экспертов и выдаёт итоговый совет с рецензированием.",
          "План питания стал нагляднее: меньше «стены текста», больше карточек и резюме.",
          "Прогресс и замеры получили отдельные блоки и историю изменений.",
        ],
      },
      {
        title: "Подготовка к продукту",
        items: [
          "Появились опорные экраны для тарификации, семьи и админского контроля.",
          "Версионность теперь помогает связывать изменения UI и backend в один список.",
        ],
      },
    ],
  },
];

export { formatReleaseTitle };
