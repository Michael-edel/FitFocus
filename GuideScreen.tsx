import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, BookMarked, CheckCircle2, Cloud, Footprints, HelpCircle, Smartphone, Sparkles, Star, ShieldCheck, Utensils, Video, Watch, MessageSquareText, ChevronRight, Download } from 'lucide-react';
import { APP_VERSION_UI_LABEL, BUILD_SHORT_LABEL } from './versioning';

type GuideMode = 'user' | 'tester';

type GuideCard = {
  title: string;
  text: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
};

const userCards: GuideCard[] = [
  {
    title: 'Вход только через Google',
    text: 'Один Google account = один cloud profile. Это нужно для синхронизации между iPhone и компьютером и для защиты подписки.',
    badge: '1 account = 1 profile',
    icon: Cloud,
  },
  {
    title: 'Заполните профиль',
    text: 'Укажите вес, рост, возраст, пол и цель. После этого FitFocus рассчитает AI-план, калории и недельный фокус.',
    badge: 'Старт',
    icon: Sparkles,
  },
  {
    title: 'Ведите прогресс',
    text: 'Добавляйте вес, обхваты, сахар, шаги, сон, активные минуты и фото прогресса. Если поле не введено, оно не ломает формулы.',
    badge: 'Замеры',
    icon: Footprints,
  },
  {
    title: 'Добавляйте рецепты',
    text: 'Снимайте блюдо или загружайте фото. Карточку можно открыть и редактировать даже без фото, граммовки или шагов.',
    badge: 'Рецепты',
    icon: Utensils,
  },
  {
    title: 'Подключите часы',
    text: 'Apple Health, Google Fit, Fitbit, Garmin или ручной импорт. Если данные уже есть в Apple Health, FitFocus Bridge их подтянет.',
    badge: 'Wearable',
    icon: Watch,
  },
  {
    title: 'Синхронизация и облако',
    text: 'При проблемах проверьте Google-аккаунт, облачную синхронизацию и статус Cloud в боковом меню. На одном аккаунте не смешивайте разные профили.',
    badge: 'Cloud',
    icon: CheckCircle2,
  },
];

const testerCards: GuideCard[] = [
  {
    title: 'Проверьте авторизацию',
    text: 'Войдите через Google, убедитесь, что создаётся именно cloud-профиль, и проверьте поведение на двух устройствах одновременно.',
    badge: 'Auth',
    icon: ShieldCheck,
  },
  {
    title: 'Тестируйте синк',
    text: 'Проверьте сохранение профиля, перезагрузку из облака, выход, повторный вход и конфликт локальных данных.',
    badge: 'Cloud',
    icon: Cloud,
  },
  {
    title: 'Проверьте рецепты',
    text: 'Проверьте распознавание по фото, ручное редактирование, открытие карточки без граммовки, без фото и без шагов.',
    badge: 'Recipes',
    icon: Utensils,
  },
  {
    title: 'Проверьте прогресс',
    text: 'Добавьте сахар, сон, шаги, пульс и фото. Убедитесь, что источник данных виден и значения не используются без ввода.',
    badge: 'Progress',
    icon: Footprints,
  },
  {
    title: 'Сообщайте об ошибках',
    text: 'Пишите: экран, устройство, шаги воспроизведения, что ожидалось и что произошло. Лучше добавлять фото, видео или голос.',
    badge: 'Feedback',
    icon: MessageSquareText,
  },
  {
    title: 'Ограничьте тест',
    text: 'Если выдаёте тестовый доступ, задавайте срок до 30 дней и не ограничивайте тариф, чтобы увидеть реальную нагрузку.',
    badge: 'QA',
    icon: Star,
  },
];

const quickChecklist = [
  'Google-авторизация проходит без обходных локальных аккаунтов.',
  'На iPhone и компьютере виден один cloud profile на один Google account.',
  'Рецепты открываются даже если фото, граммовка или шаги не подтянулись.',
  'Сахар не участвует в формулах, если не введён.',
  'Шаги и сон показывают источник: ручной ввод, bridge или wearable.',
];

const pushInstructions = [
  {
    title: 'iPhone',
    badge: 'Safari / PWA',
    icon: Smartphone,
    steps: [
      'Откройте FitFocus и добавьте его на экран «Домой» через кнопку «Поделиться».',
      'Разрешите уведомления, когда iPhone покажет системный запрос.',
      'Если запрос не появился, проверьте Настройки iPhone → Уведомления → FitFocus.',
    ],
    note: 'На iPhone push надёжнее работают в установленном приложении, а не в обычной вкладке браузера.',
  },
  {
    title: 'Android',
    badge: 'Chrome / PWA',
    icon: Download,
    steps: [
      'Откройте FitFocus в Chrome или другом Chromium-браузере.',
      'Разрешите уведомления в браузере и, по желанию, установите приложение на главный экран.',
      'Если уведомлений нет, проверьте системные настройки Android и разрешения для сайта.',
    ],
    note: 'На Android push обычно работают и в браузере, и в PWA-режиме, если разрешения включены.',
  },
  {
    title: 'Проверка',
    badge: 'FitFocus',
    icon: Bell,
    steps: [
      'Откройте Настройки → Push-уведомления.',
      'Нажмите «Включить push» или «Отправить тест».',
      'Если уведомление не пришло, сначала проверьте статус Cloud и разрешение Notification.',
    ],
    note: 'Если push не приходят, чаще всего причина в отключённом разрешении или в том, что приложение открыто не как PWA.',
  },
];

export default function GuideScreen() {
  const [mode, setMode] = useState<GuideMode>('user');
  const cards = mode === 'user' ? userCards : testerCards;
  const title = mode === 'user' ? 'Инструкция для пользователя' : 'Инструкция для тестера';
  const subtitle = mode === 'user'
    ? 'Короткая схема, как начать пользоваться FitFocus и где смотреть данные.'
    : 'Что именно проверять, как присылать баги и на что смотреть в первую очередь.';

  const footerText = useMemo(() => {
    return mode === 'user'
      ? 'Если что-то не работает, сначала проверьте Google-аккаунт, cloud-статус и активный профиль.'
      : 'Для теста важны повторяемость, нагрузка и фиксация ошибок с доказательствами.';
  }, [mode]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4 max-w-5xl">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-100">
          <BookMarked className="h-3.5 w-3.5" />
          Инструкция в приложении
        </div>
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-100">{title}</h1>
          <p className="mt-3 max-w-3xl text-slate-400 font-medium leading-7">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('user')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black border transition-all ${mode === 'user' ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200' : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'}`}
          >
            <HelpCircle size={16} />
            Пользователь
          </button>
          <button
            type="button"
            onClick={() => setMode('tester')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black border transition-all ${mode === 'tester' ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200' : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'}`}
          >
            <MessageSquareText size={16} />
            Тестер
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Текущая сборка</div>
          <div className="mt-2 text-xl font-black text-slate-100">{APP_VERSION_UI_LABEL}</div>
          <div className="mt-1 inline-flex items-center rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
            {BUILD_SHORT_LABEL}
          </div>
          <div className="mt-2 text-slate-400 font-medium leading-7">Релиз продукта меняется только при новом выпуске, а сборка main обновляется автоматически на каждый push. Инструкция всегда совпадает с текущей сборкой.</div>
        </div>
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Главное правило</div>
          <div className="mt-2 text-2xl font-black text-slate-100">1 Google account = 1 cloud profile</div>
          <div className="mt-2 text-slate-400 font-medium leading-7">Данные не должны смешиваться между разными аккаунтами.</div>
        </div>
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Что проверять</div>
          <div className="mt-2 text-2xl font-black text-slate-100">Синк, рецепты, прогресс, часы</div>
          <div className="mt-2 text-slate-400 font-medium leading-7">Если что-то ломается, сначала смотрим источник данных и cloud-статус.</div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 md:p-7">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 flex items-center justify-center text-indigo-200 shrink-0">
            <Bell size={20} />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Push-уведомления</div>
            <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-100">Как включить уведомления на iPhone и Android</h2>
            <p className="mt-2 max-w-3xl text-slate-400 font-medium leading-7">
              Push приходят только после разрешения на устройстве. Для iPhone лучше использовать установленное приложение FitFocus,
              а на Android уведомления работают и в браузере, и в PWA-режиме.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {pushInstructions.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-[1.75rem] border border-slate-800 bg-slate-950/50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl border border-slate-800 bg-slate-900/80 flex items-center justify-center text-indigo-300">
                      <Icon size={18} />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{item.badge}</div>
                      <h3 className="mt-1 text-lg font-black text-slate-100">{item.title}</h3>
                    </div>
                  </div>
                  <div className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-200">
                    Push
                  </div>
                </div>

                <ol className="mt-4 space-y-3">
                  {item.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-6 text-slate-300">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-900/80 text-[11px] font-black text-slate-200">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-start gap-2 text-sm font-semibold text-slate-300 leading-6">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                    <span>{item.note}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl border border-slate-800 bg-slate-950/40 flex items-center justify-center text-indigo-300 shrink-0">
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">
                      {card.badge || 'FitFocus'}
                    </div>
                    <h2 className="mt-3 text-xl font-black text-slate-100">{card.title}</h2>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-slate-400 font-medium leading-7">{card.text}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 md:p-7">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 flex items-center justify-center text-indigo-200 shrink-0">
            <BookMarked size={20} />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Краткий чек-лист</div>
            <h2 className="mt-2 text-2xl font-black text-slate-100">Что должно работать в норме</h2>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {quickChecklist.map((item) => (
            <div key={item} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-4 text-slate-300 font-medium leading-7">
              {item}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-9 h-9 rounded-2xl border border-amber-500/20 bg-amber-500/10 flex items-center justify-center text-amber-200 shrink-0">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Важно</div>
              <div className="mt-2 text-slate-200 font-semibold leading-7">{footerText}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
