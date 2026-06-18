import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type FamilyShoppingItem = {
  name: string;
  grams: number;
  checked?: boolean;
};

type FamilyShopping = {
  week_start: string;
  items: FamilyShoppingItem[];
} | null;

type FamilyScreenProps = {
  cloudFamily: any | null;
  cloudFamilyMembers: any[];
  cloudFamilyLoading: boolean;
  cloudFamilyError: string | null;
  setCloudFamilyError: React.Dispatch<React.SetStateAction<string | null>>;
  familyInviteCode: string;
  familyJoinCode: string;
  familyNameDraft: string;
  setFamilyJoinCode: React.Dispatch<React.SetStateAction<string>>;
  setFamilyNameDraft: React.Dispatch<React.SetStateAction<string>>;
  loadCloudFamily: () => Promise<void>;
  createFamilyCloud: () => Promise<void>;
  joinFamilyCloud: () => Promise<void>;
  makeInviteCode: () => Promise<void>;
  generateFamilyMenuNow: () => Promise<void>;
  updateMyFamilyGoal: (goal: 'LOSS' | 'MAINTAIN') => Promise<void>;
  loadFamilyShopping: () => Promise<void>;
  familyShoppingLoading: boolean;
  familyShopping: FamilyShopping;
  toggleFamilyShoppingItem: (ingredientName: string, checked: boolean) => Promise<void>;
  formatGramsPretty: (grams: number) => string;
};

function collectFamilyRestrictions(member: any): string[] {
  const dietary = member?.dietary || {};
  return [
    ...(Array.isArray(dietary.allergens) ? dietary.allergens : []),
    ...(Array.isArray(dietary.intolerances) ? dietary.intolerances : []),
    ...(Array.isArray(dietary.excludedFoods) ? dietary.excludedFoods : []),
    ...String(member?.exclusions || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
    .map((x) => String(x).trim())
    .filter(Boolean);
}

function formatFamilyGoal(goal?: string) {
  const v = String(goal || '').toUpperCase();
  if (v === 'LOSS') return 'Похудение';
  if (v === 'MAINTAIN') return 'Удержание';
  if (v === 'GAIN') return 'Набор';
  return '—';
}

export default function FamilyScreen({
  cloudFamily,
  cloudFamilyMembers,
  cloudFamilyLoading,
  cloudFamilyError,
  setCloudFamilyError,
  familyInviteCode,
  familyJoinCode,
  familyNameDraft,
  setFamilyJoinCode,
  setFamilyNameDraft,
  loadCloudFamily,
  createFamilyCloud,
  joinFamilyCloud,
  makeInviteCode,
  generateFamilyMenuNow,
  updateMyFamilyGoal,
  loadFamilyShopping,
  familyShoppingLoading,
  familyShopping,
  toggleFamilyShoppingItem,
  formatGramsPretty,
}: FamilyScreenProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 py-10 animate-in fade-in duration-700">
      <header className="flex items-start justify-between gap-4">
        <div className="text-left">
          <h1 className="text-4xl font-black text-slate-100 mb-2">Семья</h1>
          <p className="text-slate-400 font-medium">Одна готовка для всех • разные цели (похудение/удержание) • общий список покупок</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadCloudFamily()}
            className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-full font-black text-xs uppercase tracking-widest text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 transition-all"
          >
            Обновить
          </button>
        </div>
      </header>

      {cloudFamilyLoading && (
        <div className="p-6 rounded-[2rem] bg-slate-900 border border-slate-800 text-slate-300 font-bold flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" /> Загружаю семью…
        </div>
      )}

      {cloudFamilyError && (
        <div className="p-6 rounded-[2rem] bg-rose-500/10 border border-rose-500/20 text-rose-200 font-bold">
          {cloudFamilyError}
        </div>
      )}

      {!cloudFamilyLoading && !cloudFamily && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Создать семью</p>
            <input
              value={familyNameDraft}
              onChange={(e) => setFamilyNameDraft(e.target.value)}
              placeholder="Название семьи"
              className="w-full px-5 py-4 rounded-[1.5rem] bg-slate-900 border border-slate-800 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              onClick={() => void createFamilyCloud().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
              className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-900/30 hover:bg-indigo-700 transition-all"
            >
              Создать
            </button>
            <p className="text-xs text-slate-500 font-semibold">
              После создания сделайте “Приглашение” и отправьте код на другой телефон.
            </p>
          </div>

          <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Присоединиться</p>
            <input
              value={familyJoinCode}
              onChange={(e) => setFamilyJoinCode(e.target.value)}
              placeholder="Код приглашения"
              className="w-full px-5 py-4 rounded-[1.5rem] bg-slate-900 border border-slate-800 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <button
              onClick={() => void joinFamilyCloud().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
              className="w-full py-5 bg-slate-900 border border-slate-800 rounded-[2rem] font-black text-lg text-slate-100 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
            >
              Войти в семью
            </button>
            <p className="text-xs text-slate-500 font-semibold">
              Введите код от владельца семьи. После входа у вас появится общий план и shopping list.
            </p>
          </div>
        </div>
      )}

      {!cloudFamilyLoading && cloudFamily && (
        <div className="space-y-6">
          <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Ваша семья</p>
                <h3 className="text-2xl font-black text-slate-100 mt-1">{cloudFamily?.name || 'Семья'}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  Участников: {cloudFamilyMembers.length || 1}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => void makeInviteCode().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                  className="px-6 py-4 bg-slate-900 border border-slate-800 rounded-[2rem] font-black text-sm text-slate-100 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                >
                  Создать приглашение
                </button>
                <button
                  onClick={() => void generateFamilyMenuNow().catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                  className="px-6 py-4 bg-indigo-600 text-white rounded-[2rem] font-black text-sm shadow-xl shadow-indigo-900/30 hover:bg-indigo-700 transition-all"
                >
                  Сгенерировать семейное меню
                </button>
              </div>
            </div>

            {familyInviteCode && (
              <div className="mt-5 p-5 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-200/80">Код приглашения</p>
                  <p className="text-2xl font-black text-indigo-100 mt-1 tracking-widest">{familyInviteCode}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(familyInviteCode);
                    } catch {}
                  }}
                  className="px-6 py-4 bg-slate-950 border border-slate-800 rounded-[2rem] font-black text-sm text-slate-100 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                >
                  Скопировать
                </button>
              </div>
            )}
          </div>

          <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Участники</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void updateMyFamilyGoal('LOSS').catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                  className="px-4 py-2 rounded-full border border-slate-800 bg-slate-900 text-xs font-black text-slate-200 hover:border-emerald-500/30 hover:text-emerald-200 transition-all"
                  title="Похудение"
                >
                  Я: похудение
                </button>
                <button
                  onClick={() => void updateMyFamilyGoal('MAINTAIN').catch((e) => setCloudFamilyError(e?.message || 'Ошибка'))}
                  className="px-4 py-2 rounded-full border border-slate-800 bg-slate-900 text-xs font-black text-slate-200 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                  title="Удержание"
                >
                  Я: удержание
                </button>
              </div>
            </div>

            <div className="p-4 rounded-[1.6rem] bg-slate-900/40 border border-slate-800">
              <p className="text-sm font-bold text-slate-100">
                Ограничения семьи
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Аллергии, непереносимости и исключённые продукты каждого участника будут
                учитываться при генерации общего меню.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cloudFamilyMembers.map((m: any, i: number) => {
                const restrictions = collectFamilyRestrictions(m);

                return (
                  <div
                    key={`${m.user_id}-${i}`}
                    className="p-5 rounded-[2rem] bg-slate-900/40 border border-slate-800 min-w-0 overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-100 truncate">
                          {m.name || m.user_id}
                        </p>

                        <p className="text-xs text-slate-500 mt-1 break-all">
                          {m.email || m.user_id}
                        </p>

                        <p className="text-xs text-slate-500 mt-1">
                          Цель: {formatFamilyGoal(m.goal)}
                        </p>
                      </div>

                      <span className="text-[10px] px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                        {m.role || 'member'}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {restrictions.length ? (
                        restrictions.map((item) => (
                          <span
                            key={item}
                            className="px-2 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-200 text-[11px]"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">
                          Ограничения не указаны
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 font-semibold">
              Советы: поставьте цели участникам (похудение/удержание), затем нажмите “Сгенерировать семейное меню”.
            </p>
          </div>

          <div className="p-8 rounded-[2.5rem] bg-slate-950 border border-slate-800 text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Семейный список покупок</p>
                <p className="text-xs text-slate-500 font-semibold mt-1">Сумма по всем участникам на текущую неделю.</p>
              </div>
              <button
                onClick={() => void loadFamilyShopping()}
                className="px-5 py-3 bg-slate-900 border border-slate-800 rounded-full font-black text-xs uppercase tracking-widest text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 transition-all"
              >
                Обновить список
              </button>
            </div>

            {familyShoppingLoading ? (
              <div className="mt-4 text-slate-400 font-bold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Загружаю…</div>
            ) : familyShopping?.items?.length ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-bold text-slate-200">
                {familyShopping.items.slice(0, 60).map((it, idx) => (
                  <label key={idx} className={clsx(
                    "p-3 rounded-[1.2rem] border flex items-center justify-between gap-3 cursor-pointer transition-all",
                    it.checked ? "bg-slate-900/20 border-slate-800 text-slate-500 line-through" : "bg-slate-950/40 border-slate-800 text-slate-200"
                  )}>
                    <span className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        className="accent-indigo-400 shrink-0"
                        checked={!!it.checked}
                        onChange={(e) => void toggleFamilyShoppingItem(it.name, e.target.checked)}
                      />
                      <span className="truncate">• {it.name}</span>
                    </span>
                    <span className="text-slate-400 tabular-nums shrink-0">{formatGramsPretty(it.grams)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500 font-semibold">
                Пока пусто. Нажмите “Сгенерировать семейное меню”.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
