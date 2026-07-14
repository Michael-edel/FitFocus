import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FoodInsight, FoodIngredient, FavoriteRecipe } from './types';
import { getRecipeFromPhoto } from './geminiService';
import { bumpRecipeUsage, canGenerateRecipe } from './usage';
import { Heart } from 'lucide-react';

type Props = {
  photo: string;
  name: string;
  insight: FoodInsight;
  onClose?: () => void;
  isPro?: boolean;
  onUpdateInsight?: (nextInsight: FoodInsight) => void;
  onSaveRecipe?: (fav: FavoriteRecipe) => void;
  onEdit?: () => void;
  nonFood?: boolean;
};

type CalloutSide = 'left' | 'right';
type CalloutPoint = { x: number; y: number };
type CalloutMeta = CalloutPoint & { side: CalloutSide };
type CalloutFix = { dx: number; dy: number; side?: CalloutSide };
type CalloutIngredient = FoodIngredient & {
  __idx: number;
  __callout: CalloutMeta;
  __anchor: CalloutPoint;
};
type TotalSelection = { __type: 'TOTAL' };
type ActiveSelection = FoodIngredient | CalloutIngredient | TotalSelection;
type IngredientBreakdown = { name: string; percent: number | null; kcal: number | null };
type CssVarStyle = React.CSSProperties & { [key: `--ff-${string}`]: string };

const isTotalSelection = (value: ActiveSelection | null): value is TotalSelection =>
  Boolean(value && '__type' in value && value.__type === 'TOTAL');

const isIngredientSelection = (value: ActiveSelection | null): value is FoodIngredient =>
  Boolean(value) && !isTotalSelection(value);

export default function FoodInsightCard({ photo, name, insight, onClose, isPro, onUpdateInsight, onSaveRecipe, onEdit, nonFood = false }: Props) {
  const [active, setActive] = useState<ActiveSelection | null>(null);
  const [haloTheme, setHaloTheme] = useState<'light' | 'dark'>('light');
  const [focusMode, setFocusMode] = useState<boolean>(true);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeErr, setRecipeErr] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const calloutRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [calloutFix, setCalloutFix] = useState<Record<number, CalloutFix>>({});

  const plan: 'free' | 'pro' | 'family' = isPro ? 'pro' : 'free';

  const callouts = useMemo<CalloutIngredient[]>(() => {
    if (nonFood) return [];
    const items = (insight?.ingredients || []).slice(0, 8);
    const n = items.length || 1;
    
    // Круговая раскладка вокруг тарелки
    return items.map((it: FoodIngredient, idx: number) => {
      const angle = (-60 + (360 / n) * idx) * (Math.PI / 180);
      
      const cxRaw = 50 + 42 * Math.cos(angle);
      const cyRaw = 52 + 42 * Math.sin(angle);
      
      const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
      const cx = clamp(cxRaw, 8, 92);
      const cy = clamp(cyRaw, 10, 90);
      
      const ax = 50 + 28 * Math.cos(angle);
      const ay = 54 + 28 * Math.sin(angle);
      
      const side = Math.cos(angle) >= 0 ? 'right' : 'left';
      
      return {
        ...it,
        __idx: idx,
        __callout: { x: cx, y: cy, side },
        __anchor: { x: ax, y: ay },
      };
    });
  }, [insight, nonFood]);

  const totalCalories = useMemo(() => {
    if (nonFood) return 0;
    const v = insight?.calories;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }, [insight, nonFood]);

  const macroPct = useMemo(() => {
    if (nonFood) return { protein: 0, carbs: 0, fats: 0 };
    const m = insight?.macros;
    const p = m ? (typeof m.protein === 'number' ? m.protein : Number(m.protein)) : NaN;
    const c = m ? (typeof m.carbs === 'number' ? m.carbs : Number(m.carbs)) : NaN;
    const f = m ? (typeof m.fat === 'number' ? m.fat : Number(m.fat)) : NaN;
    return {
      protein: Number.isFinite(p) ? p : null,
      carbs: Number.isFinite(c) ? c : null,
      fats: Number.isFinite(f) ? f : null,
    };
  }, [insight, nonFood]);

  const ingredientBreakdown = useMemo(() => {
    const ings = Array.isArray(insight?.ingredients) ? insight.ingredients : [];
    if (nonFood || !totalCalories) return [];
    return ings
      .filter((i): i is FoodIngredient => Boolean(i?.name))
      .map((i): IngredientBreakdown => {
        const pct = typeof i.percent === 'number' ? i.percent : Number(i.percent);
        const percent = Number.isFinite(pct) ? pct : null;
        const kcal = (percent != null && totalCalories != null) ? Math.round(totalCalories * (percent / 100)) : null;
        return { name: String(i.name), percent, kcal };
      })
      .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
      .slice(0, 8);
  }, [insight, totalCalories, nonFood]);

  const recipe = nonFood ? undefined : insight?.recipe;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;

    const next: Record<number, CalloutFix> = {};
    let changed = false;

    for (const c of callouts) {
      const idx = c.__idx;
      const el = calloutRefs.current[idx];
      if (!el) continue;

      const r = el.getBoundingClientRect();
      const left = r.left - stageRect.left;
      const top = r.top - stageRect.top;
      const right = left + r.width;
      const bottom = top + r.height;

      const pad = 10;
      let dx = 0;
      let dy = 0;

      if (left < pad) dx += (pad - left);
      if (right > stageRect.width - pad) dx -= (right - (stageRect.width - pad));
      if (top < pad) dy += (pad - top);
      if (bottom > stageRect.height - pad) dy -= (bottom - (stageRect.height - pad));

      let side: CalloutSide | undefined;
      const baseSide = c.__callout.side;
      const hasRightOverflow = right > stageRect.width - pad;
      const hasLeftOverflow = left < pad;
      if (baseSide === 'right' && hasRightOverflow && !hasLeftOverflow) side = 'left';
      if (baseSide === 'left' && hasLeftOverflow && !hasRightOverflow) side = 'right';

      if (dx !== 0 || dy !== 0 || side) {
        next[idx] = { dx, dy, side };
        const prev = calloutFix[idx];
        if (!prev || prev.dx !== dx || prev.dy !== dy || prev.side !== side) changed = true;
      }
    }

    if (changed) setCalloutFix(next);
  }, [callouts.length, photo, calloutFix, callouts]);

  const activeCallout = useMemo(() => {
    if (!isIngredientSelection(active)) return undefined;
    return callouts.find(c => c.name === active.name);
  }, [active, callouts]);

  const activePos = useMemo(() => {
    if (!isIngredientSelection(active)) return null;
    const ax = active.highlightArea?.x ?? activeCallout?.__anchor?.x;
    const ay = active.highlightArea?.y ?? activeCallout?.__anchor?.y;
    const cx = activeCallout?.__callout?.x;
    const cy = activeCallout?.__callout?.y;
    if (typeof ax !== 'number' || typeof ay !== 'number') return null;
    return { ax, ay, cx, cy };
  }, [active, activeCallout]);

  const vectorAngleDeg = useMemo(() => {
    if (!activePos || typeof activePos.cx !== 'number' || typeof activePos.cy !== 'number') return -35;
    const dx = activePos.cx - activePos.ax;
    const dy = activePos.cy - activePos.ay;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }, [activePos]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !isIngredientSelection(active)) return;

    const ha = active.highlightArea;
    const anchor = activeCallout?.__anchor;
    
    const sx_pct = ha?.x ?? anchor?.x;
    const sy_pct = ha?.y ?? anchor?.y;

    if (sx_pct === undefined || sy_pct === undefined) {
      setHaloTheme('light');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const analyze = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return;

      canvas.width = w;
      canvas.height = h;

      try {
        ctx.drawImage(img, 0, 0, w, h);
        const cx = Math.round((sx_pct / 100) * w);
        const cy = Math.round((sy_pct / 100) * h);
        const rr = Math.round(((ha?.r ?? 6) / 100) * Math.min(w, h));
        const sampleSize = Math.max(8, Math.min(48, Math.round(rr * 0.6)));

        const startX = Math.max(0, cx - sampleSize);
        const startY = Math.max(0, cy - sampleSize);
        const width = Math.min(w - startX, sampleSize * 2);
        const height = Math.min(h - startY, sampleSize * 2);

        if (width <= 0 || height <= 0) return;

        const imgData = ctx.getImageData(startX, startY, width, height).data;
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let i = 0; i < imgData.length; i += 16) {
          r += imgData[i];
          g += imgData[i + 1];
          b += imgData[i + 2];
          count++;
        }
        r /= count; g /= count; b /= count;

        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        setHaloTheme(luminance > 0.62 ? 'dark' : 'light');
      } catch (e) {
        setHaloTheme('light');
      }
    };

    if (img.complete) analyze();
    else img.onload = analyze;
  }, [active, activeCallout, photo]);

  const hasRecipe = !nonFood && !!insight.recipe;
  const activeIngredientName = isIngredientSelection(active) ? active.name : null;
  const isIngredientActive = (ingredientName: string) => activeIngredientName === ingredientName;
  const shouldDimIngredient = (ingredientName: string) => Boolean(active && activeIngredientName !== ingredientName);
  const activeHighlight = isIngredientSelection(active) ? active.highlightArea : undefined;
  const focusStyle: CssVarStyle | undefined = activePos && focusMode ? {
    '--ff-focus-x': activePos.ax + '%',
    '--ff-focus-y': activePos.ay + '%',
  } : undefined;
  const haloRadius = activeHighlight?.r ?? 6;
  const haloStyle: CssVarStyle | undefined = isIngredientSelection(active) ? {
    left: ((activeHighlight?.x ?? activeCallout?.__anchor?.x) ?? 50) + '%',
    top: ((activeHighlight?.y ?? activeCallout?.__anchor?.y) ?? 50) + '%',
    '--ff-halo-r': haloRadius + '%',
    '--ff-halo-rx': (haloRadius * 1.25) + '%',
    '--ff-halo-ry': (haloRadius * 0.95) + '%',
    '--ff-halo-rot': vectorAngleDeg + 'deg',
  } : undefined;
  const vectorStyle: CssVarStyle | undefined = activePos && typeof activePos.cx === 'number' && typeof activePos.cy === 'number' ? {
    left: activePos.ax + '%',
    top: activePos.ay + '%',
    '--ff-vector-ang': vectorAngleDeg + 'deg',
    '--ff-vector-len': Math.min(42, Math.max(18, Math.hypot(activePos.cx - activePos.ax, activePos.cy - activePos.ay))) + '%',
  } : undefined;

  return (
    <div className="ff-infocard">
      <div className="ff-infocard__header">
        <div className="ff-infocard__title" title={"Разбор по фото: " + name}>Разбор по фото: {name}</div>
        {onClose ? (
          <button className="ff-infocard__close" onClick={onClose}>×</button>
        ) : null}
      </div>

      <div 
        className={`ff-infocard__stage ${active && focusMode ? 'ff-infocard__stage--focus' : ''}`} 
        ref={stageRef}
        style={focusStyle}
      >
        <img ref={imgRef} className="ff-infocard__photo ff-infocard__photo--sharp" src={photo} alt={name} crossOrigin="anonymous" />
        <div className="ff-infocard__overlay" />

        <div className="ff-infocard__uiLayer">
          
          {haloStyle ? (
            <div
              className={`ff-infocard__haloArea ff-infocard__haloArea--oval ff-infocard__haloArea--${haloTheme}`}
              style={haloStyle}
              aria-hidden="true"
            />
          ) : null}

          {vectorStyle ? (
            <div
              className="ff-infocard__vector"
              style={vectorStyle}
              aria-hidden="true"
            />
          ) : null}

          <button
            type="button"
            className={"ff-infocard__bubble ff-ui ff-infocard__bubbleBtn" + (isTotalSelection(active) ? " ff-infocard__bubbleBtn--active" : "")}
            onClick={() => setActive({ __type: 'TOTAL' })}
            aria-label={nonFood ? "Не еда — запись не учитывается в КБЖУ" : "Итого калорий — открыть детали"}
            title={nonFood ? "Запись не учитывается в КБЖУ" : "Нажми, чтобы увидеть детали расчёта"}
          >
            <div className="ff-infocard__bubbleLabel">{nonFood ? 'НЕ ЕДА' : 'ИТОГО'}</div>
            <div className="ff-infocard__bubbleValue">{totalCalories ?? '—'}</div>
            <div className="ff-infocard__bubbleUnit">ккал</div>
            <div className="ff-infocard__bubbleHint">{nonFood ? 'не учитывается' : 'детали'}</div>
          </button>

          <svg className="ff-infocard__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {callouts.map((c) => (
              <line
                key={c.__idx}
                x1={c.__anchor.x}
                y1={c.__anchor.y}
                x2={c.__callout.x}
                y2={c.__callout.y}
                strokeOpacity={shouldDimIngredient(c.name) ? 0.2 : 1}
                style={{ transition: 'stroke-opacity 0.3s' }}
              />
            ))}
          </svg>

          {callouts.map((c) => {
            const fix = calloutFix[c.__idx] || { dx: 0, dy: 0 };
            const side = (fix.side || c.__callout.side);
            return (
              <button
                key={c.__idx}
                ref={(el) => { calloutRefs.current[c.__idx] = el; }}
                className={`ff-infocard__callout ff-ui ff-infocard__callout--${side} ${isIngredientActive(c.name) ? 'ff-infocard__callout--active' : ''} ${focusMode && shouldDimIngredient(c.name) ? 'ff-infocard__callout--dim' : ''}`}
                style={{ 
                  left: c.__callout.x + '%', 
                  top: c.__callout.y + '%',
                  opacity: active && active.name !== c.name ? 0.5 : 1,
                  transform: `translate(${side === 'left' ? '-100%' : '0%'}, -50%) ${active?.name === c.name ? 'scale(1.1)' : 'scale(1)'}`,
                  translate: `${fix.dx || 0}px ${fix.dy || 0}px`
                }}
                onMouseEnter={() => setActive(c)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive((cur) => (isIngredientSelection(cur) && cur.name === c.name ? null : c))}
                type="button"
              >
                <span className="ff-infocard__dot" />
                <span className="ff-infocard__calloutText">
                  <span className="ff-infocard__calloutName">{c.name}</span>
                  <span className="ff-infocard__calloutPct">{typeof c.percent === 'number' ? Math.round(c.percent) + '#' : ''}</span>
                </span>
              </button>
            );
          })}

          <div className="ff-infocard__macros ff-ui">
            <div className="ff-infocard__macro">
              <div className="ff-infocard__macroK">Белки</div>
              <div className="ff-infocard__macroV">{Math.round(insight?.macros?.protein ?? 0)}г</div>
            </div>
            <div className="ff-infocard__macro">
              <div className="ff-infocard__macroK">Углеводы</div>
              <div className="ff-infocard__macroV">{Math.round(insight?.macros?.carbs ?? 0)}г</div>
            </div>
            <div className="ff-infocard__macro">
              <div className="ff-infocard__macroK">Жиры</div>
              <div className="ff-infocard__macroV">{Math.round(insight?.macros?.fat ?? 0)}г</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ff-infocard__notes">
        {(insight?.notes || []).slice(0, 4).map((n: string, i: number) => (
          <div className="ff-infocard__note" key={i}>• {n}</div>
        ))}
      </div>

      <div className="ff-infocard__ingredientsList" aria-label="Ингредиенты">
        {nonFood ? (
          <div className="ff-infocard__ingredient">
            <span className="ff-infocard__ingredientName">Пищевой состав не применяется</span>
            <span className="ff-infocard__ingredientPct">0%</span>
          </div>
        ) : (insight?.ingredients || []).slice(0, 8).map((it, idx) => (
          <button
            className={`ff-infocard__ingredient ${isIngredientActive(it.name) ? 'ff-infocard__ingredient--active' : ''} ${focusMode && shouldDimIngredient(it.name) ? 'ff-infocard__ingredient--dim' : ''}`}
            key={idx}
            onMouseEnter={() => setActive(it)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive((cur) => isIngredientSelection(cur) && cur.name === it.name ? null : it)}
            type="button"
          >
            <span className="ff-infocard__ingredientName">{it.name}</span>
            <span className="ff-infocard__ingredientPct">{typeof it.percent === 'number' ? Math.round(it.percent) + '%' : ''}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {hasRecipe && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!insight.recipe) return;
              onSaveRecipe?.({
                id: `fav_${Date.now()}`,
                title: insight.recipe.title || name,
                createdAt: new Date().toISOString(),
                photo,
                recipe: insight.recipe,
                sourceFoodName: name,
              });
              alert('Рецепт сохранён в избранное!');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 border border-rose-500/20 transition-all font-bold text-xs"
            title="Сохранить в рецепты"
          >
            <Heart className="w-4 h-4" />
            Сохранить рецепт
          </button>
        )}
        {onEdit ? (
          <button
            className="ff-infocard__focusToggle"
            type="button"
            onClick={onEdit}
            title="Исправить название, КБЖУ, состав и приём пищи"
          >
            Корректировать
          </button>
        ) : null}
        <button
          className="ff-infocard__focusToggle"
          type="button"
          onClick={() => setFocusMode((v) => !v)}
        >
          {focusMode ? 'Фокус: ВКЛ' : 'Фокус: ВЫКЛ'}
        </button>
      </div>

      {active ? (
        <div className="ff-infocard__tooltip" role="dialog" aria-modal="true">
          {isTotalSelection(active) ? (
            <>
              <div className="ff-infocard__tooltipTitle">{nonFood ? 'Не еда' : 'Итого калорий'}</div>
              {nonFood ? (
                <div className="ff-infocard__tooltipRow">
                  Запись не учитывается в дневных КБЖУ. Чтобы перевести её в еду, откройте корректировку и вручную заполните КБЖУ или состав.
                </div>
              ) : (
                <div className="ff-infocard__tooltipRow">
                  Оценка: <b>{totalCalories ?? '—'} ккал</b>
                </div>
              )}

              {!nonFood && (macroPct.protein != null || macroPct.carbs != null || macroPct.fats != null) ? (
                <div className="ff-infocard__tooltipRow">
                  Макросы (в граммах):{" "}
                  <span className="ff-infocard__pill">Б {Math.round(macroPct.protein ?? 0)}</span>
                  <span className="ff-infocard__pill">У {Math.round(macroPct.carbs ?? 0)}</span>
                  <span className="ff-infocard__pill">Ж {Math.round(macroPct.fats ?? 0)}</span>
                </div>
              ) : null}

              {ingredientBreakdown.length ? (
                <div className="ff-infocard__tooltipRow">
                  Разбивка по ингредиентам:
                  <div className="ff-infocard__breakdown">
                    {ingredientBreakdown.map((it) => (
                      <div className="ff-infocard__breakdownRow" key={it.name}>
                        <span className="ff-infocard__breakdownName" title={it.name}>{it.name}</span>
                        <span className="ff-infocard__breakdownMeta">
                          {it.percent != null ? Math.round(it.percent) + '%' : '—'}
                          {it.kcal != null ? " • " + it.kcal + " ккал" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="ff-infocard__recipeBlock">
                    <div className="ff-infocard__recipeTitleRow">
                      <div className="ff-infocard__recipeTitle text-slate-100 uppercase tracking-widest text-[11px] font-black">Рецепт (PRO)</div>
                      {recipe?.timeMinutes ? (
                        <div className="ff-infocard__recipeMeta text-[10px] text-indigo-400 font-bold">{recipe.timeMinutes} мин</div>
                      ) : null}
                    </div>

                    <div className="ff-infocard__recipePhotoWrap">
                      <img className="ff-infocard__recipePhoto" src={photo} alt="Фото блюда" />
                    </div>

                    {(!isPro) ? (
                      <div className="ff-infocard__upgradeBox">
                        <div className="ff-infocard__upgradeTitle">Пошаговый рецепт — PRO</div>
                        <div className="ff-infocard__upgradeText">
                          Получай рецепт по фото, сохраняй и делись. В Free — недоступно.
                        </div>
                        <button
                          type="button"
                          className="ff-infocard__upgradeBtn"
                          onClick={() => {
                            alert('Перейдите в раздел Тарифы для активации PRO.');
                          }}
                        >
                          Перейти на PRO
                        </button>
                      </div>
                    ) : recipe ? (
                      <div className="ff-infocard__recipeContent ff-infocard__scrollArea text-left" role="region" aria-label="Рецепт">
                        <div className="ff-infocard__recipeH text-indigo-100 font-black mt-2">{recipe.title}</div>
                        {(recipe.servings || recipe.timeMinutes) ? (
                          <div className="ff-infocard__recipeMeta2 text-[10px] text-slate-500 font-bold">
                            {recipe.servings ? `Порций: ${recipe.servings}` : ''}
                            {recipe.servings && recipe.timeMinutes ? ' • ' : ''}
                            {recipe.timeMinutes ? `Время: ${recipe.timeMinutes} мин` : ''}
                          </div>
                        ) : null}
                        {recipe.ingredients?.length ? (
                          <>
                            <div className="ff-infocard__recipeSub text-[10px] uppercase font-black text-slate-400 mt-3">Ингредиенты</div>
                            <ul className="ff-infocard__recipeList text-[12px] text-slate-300 mt-1">
                              {recipe.ingredients.slice(0, 18).map((it, i) => (
                                <li key={i} className="list-disc ml-4 flex items-start justify-between gap-4"><span className="min-w-0">{it.name}</span>{it.amount ? <span className="text-slate-500 whitespace-nowrap">{it.amount}</span> : null}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {recipe.steps?.length ? (
                          <>
                            <div className="ff-infocard__recipeSub text-[10px] uppercase font-black text-slate-400 mt-3">Шаги</div>
                            <ol className="ff-infocard__recipeSteps text-[12px] text-slate-300 mt-1">
                              {recipe.steps.slice(0, 14).map((s) => (
                                <li key={s.n} className="mb-2"><span className="font-black text-indigo-400 mr-1">{s.n}.</span> {s.text}{s.timeMin ? ` (${s.timeMin} мин)` : ''}</li>
                              ))}
                            </ol>
                          </>
                        ) : null}
                        {recipe.tips?.length ? (
                          <>
                            <div className="ff-infocard__recipeSub text-[10px] uppercase font-black text-slate-400 mt-3">Советы</div>
                            <ul className="ff-infocard__recipeList text-[12px] text-slate-300 mt-1 italic">
                              {recipe.tips.slice(0, 6).map((t, i) => (
                                <li key={i} className="list-disc ml-4">{t}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}

                        <div className="ff-infocard__recipeActions ff-infocard__stickyBar">
                          <button
                            type="button"
                            className="ff-infocard__recipeActionBtn"
                            onClick={async () => {
                              const text =
                                `Рецепт: ${recipe.title}\n\n` +
                                (recipe.ingredients?.length
                                  ? `Ингредиенты:\n- ` + recipe.ingredients.map((i) => `${i.name}${i.amount ? ` — ${i.amount}` : ''}`).join('\n- ') + '\n\n'
                                  : '') +
                                (recipe.steps?.length
                                  ? `Шаги:\n` + recipe.steps.map((s) => `${s.n}. ${s.text}${s.timeMin ? ` (${s.timeMin} мин)` : ''}`).join('\n') + '\n'
                                  : '');

                              try {
                                await navigator.clipboard.writeText(text);
                                alert('Рецепт скопирован');
                              } catch {
                                prompt('Скопируйте рецепт:', text);
                              }
                            }}
                          >
                            Скопировать
                          </button>
                          <button
                            type="button"
                            className="ff-infocard__recipeActionBtn"
                            onClick={async () => {
                              const shareText = `${recipe.title} — рецепт из FitFocus`;
                              try {
                                if (navigator.share) {
                                  await navigator.share({ title: recipe.title, text: shareText });
                                } else {
                                  alert('Поделиться не поддерживается в этом браузере.');
                                }
                              } catch {}
                            }}
                          >
                            Поделиться
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {recipeErr ? <div className="ff-infocard__disclaimer text-rose-500">Ошибка: {recipeErr}</div> : null}
                        {(() => {
                          const gate = canGenerateRecipe(plan);
                          return (
                            <div className="ff-infocard__usageRow">
                              Лимит: {gate.used}/{gate.limit} на этой неделе
                            </div>
                          );
                        })()}
                        <button
                          type="button"
                          className="ff-infocard__recipeBtn"
                          disabled={recipeLoading}
                          onClick={async () => {
                            try {
                              setRecipeErr(null);
                              setRecipeLoading(true);
                              const gate = canGenerateRecipe(plan);
                              if (!gate.allowed) {
                                setRecipeErr(`Лимит исчерпан: ${gate.used}/${gate.limit} на этой неделе.`);
                                return;
                              }
                              const r = await getRecipeFromPhoto(photo);
                              if (r && onUpdateInsight) {
                                const next = { ...insight, recipe: r };
                                onUpdateInsight(next);
                                bumpRecipeUsage();
                              } else if (!r) {
                                throw new Error("Не удалось распознать рецепт");
                              }
                            } catch {
                              setRecipeErr('Не удалось получить рецепт');
                            } finally {
                              setRecipeLoading(false);
                            }
                          }}
                        >
                          {recipeLoading ? 'Генерирую рецепт…' : 'Получить пошаговый рецепт'}
                        </button>
                        <div className="ff-infocard__disclaimer">
                          Генерация занимает 5–15 секунд.
                        </div>
                      </>
                    )}
                  </div>

                  <div className="ff-infocard__disclaimer">
                    Оценка приблизительная: зависит от точного веса порций и рецептуры.
                  </div>
                </div>
              ) : (
                <div className="ff-infocard__tooltipRow ff-infocard__disclaimer">
                  Данные по ингредиентам недоступны.
                </div>
              )}

              <button className="ff-infocard__tooltipClose" onClick={() => setActive(null)}>Закрыть</button>
            </>
          ) : (
            <>
              <div className="ff-infocard__tooltipTitle">{active.name}</div>
              {typeof active.percent === 'number' ? (
                <div className="ff-infocard__tooltipRow">Доля в блюде: {Math.round(active.percent)}%</div>
              ) : null}
              {active.note ? <div className="ff-infocard__tooltipRow">{active.note}</div> : null}
              <button className="ff-infocard__tooltipClose" onClick={() => setActive(null)}>Закрыть</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
