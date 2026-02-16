import React, { useMemo, useState } from 'react';
import type { FavoriteRecipe } from './types';
import { Heart, Search, Trash2, Clock3, Users } from 'lucide-react';

type Props = {
  recipes: FavoriteRecipe[];
  onRemove: (id: string) => void;
  onClear: () => void;
};

export default function RecipesScreen({ recipes, onRemove, onClear }: Props) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return recipes;
    return recipes.filter(r =>
      (r.title || '').toLowerCase().includes(s) ||
      (r.sourceFoodName || '').toLowerCase().includes(s)
    );
  }, [recipes, q]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-6 mb-8 text-left">
        <div>
          <div className="text-3xl font-black text-slate-100">Рецепты</div>
          <div className="text-slate-400 mt-2">Здесь сохраняются понравившиеся рецепты из AI-разбора блюд.</div>
        </div>
        <div className="flex items-center gap-3">
          {recipes.length > 0 && (
            <button
              onClick={onClear}
              className="px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800 text-slate-200 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all font-bold text-sm inline-flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Очистить
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-[1.5rem] px-5 py-4">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по рецептам..."
            className="flex-1 bg-transparent outline-none text-slate-100 placeholder:text-slate-600 font-semibold"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-200 flex items-center justify-center mb-4">
            <Heart className="w-7 h-7" />
          </div>
          <div className="text-slate-100 font-black text-xl">Пока нет сохранённых рецептов</div>
          <div className="text-slate-400 mt-2">
            Откройте разбор блюда и нажмите <span className="text-rose-200 font-bold">«Сохранить рецепт»</span>.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((r) => (
            <div key={r.id} className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 text-left flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-slate-100 font-black text-lg truncate">{r.title}</div>
                  {r.sourceFoodName && <div className="text-slate-500 text-sm mt-1">Из блюда: {r.sourceFoodName}</div>}
                </div>
                <button
                  onClick={() => onRemove(r.id)}
                  className="w-10 h-10 rounded-2xl bg-slate-950/40 border border-slate-800 hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-200 transition-all flex items-center justify-center"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-4 text-slate-400 text-sm">
                {typeof r.recipe.timeMinutes === 'number' && (
                  <div className="inline-flex items-center gap-2">
                    <Clock3 className="w-4 h-4" /> {r.recipe.timeMinutes} мин
                  </div>
                )}
                {typeof r.recipe.servings === 'number' && (
                  <div className="inline-flex items-center gap-2">
                    <Users className="w-4 h-4" /> {r.recipe.servings} порц.
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="text-slate-200 font-bold mb-2">Ингредиенты</div>
                <ul className="text-slate-400 text-sm space-y-1">
                  {r.recipe.ingredients.slice(0, 6).map((ing, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-indigo-300">•</span>
                      <span className="flex-1">
                        {ing.name}{ing.amount ? <span className="text-slate-500"> — {ing.amount}</span> : null}
                      </span>
                    </li>
                  ))}
                  {r.recipe.ingredients.length > 6 && (
                    <li className="text-slate-500">…и ещё {r.recipe.ingredients.length - 6}</li>
                  )}
                </ul>
              </div>

              <div className="mt-5 flex-1">
                <div className="text-slate-200 font-bold mb-2">Шаги</div>
                <ol className="text-slate-400 text-sm space-y-2">
                  {r.recipe.steps.slice(0, 3).map((s, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-200 flex items-center justify-center text-xs font-black shrink-0">
                        {s.n ?? idx + 1}
                      </span>
                      <span className="flex-1">{s.text}</span>
                    </li>
                  ))}
                  {r.recipe.steps.length > 3 && (
                    <li className="text-slate-500">…ещё {r.recipe.steps.length - 3} шага</li>
                  )}
                </ol>
              </div>

              <div className="mt-5 text-slate-500 text-xs">
                Сохранено: {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}