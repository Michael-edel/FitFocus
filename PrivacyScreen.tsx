import React from 'react';
import { Database, FileDown, LockKeyhole, ShieldCheck } from 'lucide-react';

const dataGroups = [
  'Аккаунт: OAuth id, email, имя, аватар, роли, тариф и сессии.',
  'Профиль: цель, вес, рост, возраст, активность, целевой вес, ограничения питания и медицинские заметки.',
  'Прогресс: вес, замеры, давление, пульс, сахар, фото прогресса и wearable-снимки.',
  'Питание: дневник еды, фото еды, рецепты, меню и списки покупок.',
  'Push: endpoint подписки, служебные ключи подписки, устройство, браузер и статус доставки.',
  'Поддержка: обращения, сообщения, вложения, контакт для ответа и диагностика устройства.',
];

const storageFacts = [
  'Основной источник правды авторизованного пользователя: Cloudflare D1.',
  'Локальный быстрый слой и резервные снимки: localStorage браузера.',
  'Вложения поддержки: D1 до лимита или Cloudflare R2, если настроен SUPPORT_ATTACHMENTS.',
  'Секреты OAuth, Stripe, Gemini, VAPID и cleanup-хуков должны храниться только в Cloudflare/GitHub secrets.',
];

export default function PrivacyScreen() {
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/55 p-6 md:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
          <ShieldCheck size={14} />
          Конфиденциальность
        </div>
        <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight text-slate-100">Данные FitFocus</h1>
        <p className="mt-3 max-w-3xl text-sm md:text-base font-semibold leading-7 text-slate-400">
          Этот раздел фиксирует фактические типы данных и хранилища проекта. Юридические реквизиты оператора и
          отдельный внешний контакт должны быть заполнены владельцем проекта перед публичным коммерческим запуском.
        </p>
        <div className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">Обновлено 28.06.2026</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/45 p-5">
          <LockKeyhole className="text-indigo-300" size={22} />
          <h2 className="mt-4 text-lg font-black text-slate-100">Что собирается</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            {dataGroups.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/45 p-5">
          <Database className="text-cyan-300" size={22} />
          <h2 className="mt-4 text-lg font-black text-slate-100">Где хранится</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            {storageFacts.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="rounded-[1.5rem] border border-slate-800 bg-slate-900/45 p-5">
          <FileDown className="text-amber-300" size={22} />
          <h2 className="mt-4 text-lg font-black text-slate-100">Контроль пользователя</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            <li>Экспорт данных доступен через настройки.</li>
            <li>Push можно отключить на текущем устройстве.</li>
            <li>Аккаунт можно удалить через настройки.</li>
            <li>Вопросы по данным отправляются через раздел поддержки.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/45 p-5 text-sm leading-7 text-slate-400">
        <p>
          FitFocus не является медицинским изделием. ИИ-рекомендации и расчеты КБЖУ требуют проверки пользователем и не
          заменяют консультацию врача или специалиста.
        </p>
        <a className="mt-4 inline-flex font-black text-indigo-300 hover:text-indigo-200" href="/privacy.html" target="_blank" rel="noreferrer">
          Открыть публичную страницу политики
        </a>
      </div>
    </section>
  );
}
