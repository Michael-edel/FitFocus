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

const currentBuildReleaseNote: ReleaseNote = {
  version: APP_VERSION_STRING,
  label: 'main',
  date: new Date(BUILD_SOURCE.builtAt).toLocaleDateString('ru-RU'),
  summary: BUILD_SOURCE.branch === 'main'
    ? 'Сборка main обновляется автоматически при каждом push. Релизная версия продукта меняется отдельно, а ниже показаны номер текущей сборки, SHA, последние изменения и схема версионирования.'
    : `Автоматическая сборка ветки ${BUILD_SOURCE.branch}.`,
  isCurrent: true,
  groups: [
    {
      title: 'Как читать номера',
      items: [
        `Версия приложения: ${APP_VERSION_STRING} — это номер релиза, он меняется только при осознанном выпуске новой версии.`,
        `Сборка main: №${BUILD_SOURCE.commitCount} · ${BUILD_SOURCE.shortSha} — это идентификатор текущего push/деплоя; он меняется автоматически при каждом изменении в main.`,
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
      items: Array.isArray(BUILD_SOURCE.recentBuilds) && BUILD_SOURCE.recentBuilds.length
        ? BUILD_SOURCE.recentBuilds.map((build) => formatBuildHistoryLine(build))
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
        `SHA: ${BUILD_SOURCE.shortSha}`,
        `Время сборки: ${new Date(BUILD_SOURCE.builtAt).toLocaleString('ru-RU')}`,
        `Коммитов в истории репозитория: ${BUILD_SOURCE.commitCount}`,
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
