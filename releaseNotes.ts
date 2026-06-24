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

function localizeCommitSubject(subject: string): string {
  const s = subject.trim();
  if (!s) return 'Коммит без описания';

  const exactMatches: Record<string, string> = {
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
    .replace(/^Remove\s+/i, 'Удалено: ')
    .replace(/^Refactor\s+/i, 'Рефакторинг: ')
    .replace(/\bautomatic\b/gi, 'автоматическое')
    .replace(/\bautomatically\b/gi, 'автоматически')
    .replace(/\bbuild\b/gi, 'сборки')
    .replace(/\bversioning\b/gi, 'версионирование')
    .replace(/\bversion\b/gi, 'версия')
    .replace(/\bmain\b/gi, 'main');

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
  summary: BUILD_SOURCE.branch === 'main'
    ? 'Сборка main обновляется автоматически при каждом push. Релизная версия продукта меняется отдельно, а ниже показаны номер текущей сборки, SHA, последние изменения и схема версионирования.'
    : `Автоматическая сборка ветки ${BUILD_SOURCE.branch}.`,
  isCurrent: true,
  groups: [
    {
      title: 'Как читать номера',
      items: [
        `Версия приложения: ${APP_VERSION_STRING} — это номер релиза, он меняется только при осознанном выпуске новой версии.`,
        `Сборка main: ${buildShortSha} — это идентификатор текущего push/деплоя; он меняется автоматически при каждом изменении в main.`,
        'API, данные и миграции версионируются отдельно, чтобы можно было обновлять приложение без поломки старых клиентов и базы.',
      ],
    },
    {
      title: 'Что изменилось',
      items: [
        'Каждый новый push в main получает отдельную сборку с собственным SHA и временем публикации.',
        'История последних деплоев показывается ниже отдельным списком и больше не затирает релизные карточки от 19.06 и прошлых дат.',
        'Подписи и краткие описания текущих изменений выводятся на русском, чтобы тестерам не приходилось расшифровывать commit subjects вручную.',
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
    label: "Beta",
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
    label: "Beta",
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
    label: "Beta",
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
