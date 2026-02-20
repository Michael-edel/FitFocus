import React, { useMemo, useState } from 'react';
import type { FavoriteRecipe } from './types';
import clsx from 'clsx';
import { analyzeFoodPhotoEnhanced } from './geminiService';
import { Heart, Search, Trash2, Clock3, Users, Camera, Upload, Loader2, X, CheckCircle2 } from 'lucide-react';

type Props = {
  recipes: FavoriteRecipe[];
  onAdd: (recipe: FavoriteRecipe) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

export default function RecipesScreen({ recipes, onAdd, onRemove, onClear }: Props) {
  const [q, setQ] = useState('');

const [isAnalyzing, setIsAnalyzing] = useState(false);
const [draft, setDraft] = useState<FavoriteRecipe | null>(null);
const fileInputRef = React.useRef<HTMLInputElement | null>(null);
const cameraInputRef = React.useRef<HTMLInputElement | null>(null);

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Не удалось прочитать файл'));
    r.onload = () => {
      const res = String(r.result || '');
      // res = data:<mime>;base64,XXXX
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    r.readAsDataURL(file);
  });

const handlePick = async (file?: File) => {
  if (!file) return;
  setIsAnalyzing(true);
  try {
    const b64 = await fileToBase64(file);
    const ai = await analyzeFoodPhotoEnhanced(b64);

    const title = (ai?.name || 'Рецепт').toString().slice(0, 80);
    const recipe: FavoriteRecipe = {
      id: (globalThis.crypto?.randomUUID?.() || String(Date.now())),
      title,
      sourceFoodName: ai?.name || '',
      calories: Number(ai?.calories || 0),
      protein: Number(ai?.protein || 0),
      fat: Number(ai?.fat || 0),
      carbs: Number(ai?.carbs || 0),
      ingredients: Array.isArray(ai?.ingredients) ? ai.ingredients.map(String) : [],
      steps: Array.isArray(ai?.steps) ? ai.steps.map(String) : [],
      servings: Number(ai?.servings || 1),
      timeMinutes: Number(ai?.timeMinutes || ai?.time_minutes || 0),
      createdAt: Date.now(),
      allergens: Array.isArray(ai?.allergens) ? ai.allergens.map(String) : undefined,
      intolerances: Array.isArray(ai?.intolerances) ? ai.intolerances.map(String) : undefined,
    } as any;

    setDraft(recipe);
  } catch (e: any) {
    alert(e?.message || 'Не удалось распознать рецепт по фото');
  } finally {
    setIsAnalyzing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }
};


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
  {draft && (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-[1.75rem] border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-slate-800">
          <div className="text-slate-100 font-black text-lg">Новый рецепт</div>
          <button onClick={() => setDraft(null)} className="p-2 rounded-full border border-slate-800 hover:border-slate-600 text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Название</label>
            <input
              value={draft.title || ''}
              onChange={(e) => setDraft({ ...draft, title: e.target.value } as any)}
              className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none font-bold text-white placeholder:text-slate-600 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "calories", label: "Ккал" },
              { k: "protein", label: "Белки" },
              { k: "fat", label: "Жиры" },
              { k: "carbs", label: "Углеводы" },
            ].map(x => (
              <div key={x.k} className="flex items-center justify-between p-3 bg-slate-900/20 rounded-[1.25rem] border border-slate-800">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{x.label}</span>
                <input
                  type="number"
                  className="w-24 bg-transparent text-right font-black text-white tabular-nums outline-none text-sm"
                  value={Number((draft as any)[x.k] || 0)}
                  onChange={(e) => setDraft({ ...draft, [x.k]: Number(e.target.value || 0) } as any)}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Ингредиенты (через запятую)</label>
            <input
              value={(draft.ingredients || []).join(", ")}
              onChange={(e) => setDraft({ ...draft, ingredients: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } as any)}
              placeholder="например: курица, рис, салат"
              className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none font-bold text-white placeholder:text-slate-600 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Аллергены / запреты (через запятую)</label>
            <input
              value={(draft.allergens || []).join(", ")}
              onChange={(e) => setDraft({ ...draft, allergens: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } as any)}
              placeholder="например: орехи, лактоза"
              className="w-full p-3.5 bg-slate-950 rounded-[1.25rem] border border-slate-800 outline-none font-bold text-white placeholder:text-slate-600 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setDraft(null)}
              className="px-4 py-2 rounded-full border border-slate-800 bg-slate-950 text-slate-200 font-black text-xs"
            >
              Отмена
            </button>
            <button
              onClick={() => {
                onAdd({ ...(draft as any), createdAt: Date.now() } as any);
                setDraft(null);
              }}
              className="px-4 py-2 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  )}

      <div className="flex items-start justify-between gap-6 mb-8 text-left">
        <div>
          <div className="text-3xl font-black text-slate-100">Рецепты</div>
          <div className="text-slate-400 mt-2">Здесь сохраняются понравившиеся рецепты из AI-разбора блюд.</div>
        </div>
        
<div className="flex items-center gap-3">
  <input
    ref={cameraInputRef}
    type="file"
    accept="image/*"
    capture="environment"
    className="hidden"
    onChange={(e) => handlePick(e.target.files?.[0])}
  />
  <input
    ref={fileInputRef}
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => handlePick(e.target.files?.[0])}
  />
  <button
    onClick={() => cameraInputRef.current?.click()}
    className={clsx("px-4 py-2 rounded-full border border-slate-800 bg-slate-950 text-slate-100 font-black text-xs flex items-center gap-2 hover:border-indigo-500/40", isAnalyzing && "opacity-60 pointer-events-none")}
    title="Снять фото блюда и распознать рецепт"
  >
    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
    Снять фото
  </button>
  <button
    onClick={() => fileInputRef.current?.click()}
    className={clsx("px-4 py-2 rounded-full border border-slate-800 bg-slate-950 text-slate-100 font-black text-xs flex items-center gap-2 hover:border-indigo-500/40", isAnalyzing && "opacity-60 pointer-events-none")}
    title="Загрузить фото блюда и распознать рецепт"
  >
    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
    Загрузить фото
  </button>

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