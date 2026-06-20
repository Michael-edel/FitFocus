import { APP_VERSION_LABEL, APP_VERSION_STRING } from './versioning';
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

function localizeCommitSubject(subject: string): string {
  const s = subject.trim();
  if (!s) return 'Коммит без описания';

  const normalized = s
    .replace(/^Add\s+automatic\s+main\s+build\s+versioning$/i, 'Добавлено автоматическое версионирование сборки main')
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
    return `Текущая сборка ${APP_VERSION_LABEL}`;
  }
  return `Версия ${release.version} ${release.label}`;
}

const currentBuildReleaseNote: ReleaseNote = {
  version: APP_VERSION_STRING,
  label: 'main',
  date: new Date(BUILD_SOURCE.builtAt).toLocaleDateString('ru-RU'),
  summary: BUILD_SOURCE.branch === 'main'
    ? 'Сборка main обновляется автоматически при каждом push. Ниже показаны изменения текущей версии и служебные данные сборки.'
    : `Автоматическая сборка ветки ${BUILD_SOURCE.branch}.`,
  isCurrent: true,
  groups: [
    {
      title: 'Что изменилось',
      items: [
        'Автосборка main теперь создаёт версию без ручных действий.',
        'Экран «Что нового» показывает текущую сборку, SHA и историю изменений на русском.',
        'Группировка по версиям помогает тестерам и команде быстрее понимать, что вошло именно в эту сборку.',
      ],
    },
    {
      title: 'Последние коммиты',
      items: BUILD_SOURCE.recentCommits.length
        ? BUILD_SOURCE.recentCommits.map((commit) => localizeCommitSubject(commit))
        : ['История коммитов недоступна в этой сборке.'],
    },
    {
      title: 'Сборка',
      items: [
        `Ветка: ${BUILD_SOURCE.branch}`,
        `Коммит: ${BUILD_SOURCE.shortSha}`,
        `Всего коммитов в репозитории: ${BUILD_SOURCE.commitCount}`,
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
