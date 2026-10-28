import React, { useEffect, useRef } from 'react';
import { FAMILY_INGREDIENTS, getFamilyRecipesForSlot } from '../../domain/familyPlanningCatalog';
import type { FamilyMealSelection, MealSlot, PortionShare, PlannedFamilyMenu, PlannedMeal } from '../../domain/familyPlanning';
import type { FamilyPlanningController } from './useFamilyPlanning';
import { MEAL_LABELS, UNIT_LABELS, prettyQuantity } from './planningUiState';

function menuSelections(c: FamilyPlanningController): FamilyMealSelection[] {
  return c.shownMenu?.planningV1.meals.map(meal => ({ slot: meal.slot, recipeId: meal.recipeId, participantShares: { ...meal.participantShares } })) ?? c.drafts.selections;
}
export function FamilyDayPanel({ controller: c }: { controller: FamilyPlanningController }) {
  const previewHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { if (c.candidate) previewHeading.current?.focus(); }, [c.candidate]);
  if (!c.family) return null;
  const menu: PlannedFamilyMenu | null = c.shownMenu;
  const participants = c.roster?.profiles.filter(profile => profile.active) ?? [];
  const selected = c.drafts.selections;
  const changeSelection = (slot: MealSlot, change: (selection: FamilyMealSelection) => FamilyMealSelection) => {
    c.changeSelections(selected.map(selection => selection.slot === slot ? change(selection) : selection));
  };
  return <section className="fp-stack" aria-label="Меню семьи на день">
    <div className="fp-card">
      <label className="fp-field" htmlFor="fp-menu-date">Дата меню<input id="fp-menu-date" type="date" value={c.drafts.date} disabled={!!c.busy}
        onChange={event => c.changeDate(event.target.value)} /></label>
      {c.staleRoster && <p className="fp-note" role="status">Профили или состав семьи изменились после подтверждения этого меню. Пересоберите меню перед готовкой; прежняя версия не проверена по новым ограничениям.</p>}
      {!c.owner && <p className="fp-muted">Меню и участие меняет организатор. Вы можете настроить свой профиль и отмечать покупки.</p>}
      {c.owner && c.selectionRecovery && <div className="fp-note"><p>Прежний выбор на {c.selectionRecovery.date} сохранён отдельно. В редакторе показано сохранённое меню; прежний выбор можно вернуть как черновик.</p>
        <button type="button" disabled={!!c.busy} onClick={c.restoreSelectionRecovery}>Восстановить прежний черновик</button></div>}
      {c.owner && <details open={!menu || undefined}><summary>Кто ест и какие порции</summary>
        <p className="fp-muted">Порции задаются вручную. Цель и возраст не меняют их автоматически.</p>
        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(slot => {
          const selection = selected.find(item => item.slot === slot);
          return <fieldset key={slot}><legend>{MEAL_LABELS[slot]}</legend>
            <label className="fp-option"><input type="checkbox" checked={!!selection} onChange={event => {
              c.changeSelections(event.target.checked ? [...selected, { slot, participantShares: Object.fromEntries(participants.map(person => [person.id, 1 as PortionShare])) }]
                : selected.filter(item => item.slot !== slot));
            }} />Готовим {MEAL_LABELS[slot].toLowerCase()}</label>
            {selection && <div className="fp-stack">{participants.map(person => {
              const share = selection.participantShares[person.id];
              return <div className="fp-person-row" key={person.id}><label className="fp-option"><input type="checkbox" checked={share !== undefined}
                onChange={event => changeSelection(slot, previous => { const shares = { ...previous.participantShares };
                  if (event.target.checked) shares[person.id] = 1; else delete shares[person.id]; return { ...previous, participantShares: shares }; })} />{person.displayName}</label>
                {share !== undefined && <label className="fp-share"><span className="fp-sr-only">Порция: {person.displayName}, {MEAL_LABELS[slot]}</span><select value={share}
                  onChange={event => changeSelection(slot, previous => ({ ...previous, participantShares: { ...previous.participantShares, [person.id]: Number(event.target.value) as PortionShare } }))}>
                  <option value="0.75">0,75 порции</option><option value="1">1 порция</option><option value="1.25">1,25 порции</option></select></label>}
              </div>;
            })}</div>}
          </fieldset>;
        })}
        <button className="fp-primary" type="button" disabled={c.commitBlocked || !selected.length} onClick={() => void c.preview()}>Посмотреть меню на день</button>
      </details>}
      {c.published && !c.currentPlan && <p className="fp-note">На этой дате есть прежнее недельное меню. При подтверждении нового дня оно сохранится в архиве.</p>}
    </div>
    {c.candidate && <div className="fp-card fp-preview"><h2 ref={previewHeading} tabIndex={-1}>Предпросмотр — ещё не сохранено</h2>
      <p>Проверьте блюда, участников и порции. Покупки обновятся после подтверждения.</p>
      <div className="fp-actions"><button className="fp-primary" type="button" disabled={c.commitBlocked} onClick={() => void c.confirm()}>Подтвердить меню</button>
        <button type="button" onClick={c.discardPreview}>Отмена предпросмотра</button></div></div>}
    {menu ? menu.planningV1.meals.map((meal: PlannedMeal) => {
      const recipe = menu.planningV1.recipes.find(item => item.recipeId === meal.recipeId);
      if (!recipe) return null;
      const totalShares = Object.values(meal.participantShares).reduce<number>((sum, share) => sum + share, 0);
      return <article className="fp-card" key={meal.id}><p className="fp-eyebrow">{MEAL_LABELS[meal.slot]}</p><h2>{recipe.title}</h2>
        {!totalShares && <p className="fp-note">В этом приёме никто не участвует.</p>}
        <ul className="fp-portions">{Object.entries(meal.participantShares).map(([id, share]) => <li key={id}><strong>{participants.find(person => person.id === id)?.displayName ?? 'Участник семьи'}</strong>
          <span>{prettyQuantity(share)} базовой порции{recipe.output ? ` · ${recipe.output.basis === 'estimate' ? '≈ ' : ''}${prettyQuantity(recipe.output.grams * share)} г готового блюда` : ''}</span></li>)}</ul>
        {recipe.output && <p className="fp-muted">Выход готового блюда: {recipe.output.basis === 'estimate' ? 'приблизительный' : 'измеренный'}. Количество сырья указано отдельно.</p>}
        <details><summary>Ингредиенты на всех — до приготовления</summary><ul className="fp-ingredients">{recipe.ingredients.map(item => <li key={`${item.ingredientId}:${item.unit}`}>
          <span>{FAMILY_INGREDIENTS.find(ingredient => ingredient.id === item.ingredientId)?.name ?? 'Продукт'}</span><strong>{prettyQuantity(item.quantity * totalShares)} {UNIT_LABELS[item.unit]}</strong></li>)}</ul></details>
        {c.owner && <details><summary>{meal.slot === 'dinner' ? 'Заменить ужин' : `Заменить ${MEAL_LABELS[meal.slot].toLowerCase()}`}</summary>
          <p className="fp-muted">Строгие ограничения проверяются сервером. Остальные приёмы и купленные продукты сохранятся.</p>
          <div className="fp-stack">{getFamilyRecipesForSlot(meal.slot).filter(item => item.recipeId !== recipe.recipeId).map(item =>
            <button key={item.recipeId} type="button" disabled={c.commitBlocked} onClick={() => void c.preview(menuSelections(c).map(selection => selection.slot === meal.slot ? { ...selection, recipeId: item.recipeId } : selection))}>{item.title}</button>)}</div>
        </details>}
        {c.owner && <details><summary>Изменить участие в этом приёме</summary>
          <div className="fp-stack">{participants.map(person => <label className="fp-option" key={person.id}><input type="checkbox" checked={meal.participantShares[person.id] !== undefined}
            disabled={c.commitBlocked} onChange={event => { const shares = { ...meal.participantShares };
              if (event.target.checked) shares[person.id] = 1; else delete shares[person.id];
              void c.preview(menuSelections(c).map(selection => selection.slot === meal.slot ? { ...selection, participantShares: shares } : selection)); }} />{person.displayName}</label>)}</div>
          <p className="fp-muted">Изменение откроется в предпросмотре. Затем нажмите «Подтвердить меню».</p>
        </details>}
      </article>;
    }) : <div className="fp-card"><h2>На этот день меню пока нет</h2><p>{c.owner ? 'Уточните профили, выберите участников и посмотрите варианты блюд.' : 'Организатор семьи ещё не подтвердил меню на эту дату.'}</p></div>}
    <button type="button" disabled={!!c.busy} onClick={() => void c.openArchive()}>Архив прежних недельных меню</button>
    {c.archiveOpen && <section className="fp-card"><div className="fp-heading-row"><h2>Архив · только просмотр</h2><button type="button" onClick={() => c.setArchiveOpen(false)}>Закрыть архив</button></div>
      <p className="fp-muted">Прежние меню не проверены по новым ограничениям. Они не являются планом выбранного дня.</p>
      {c.archives.length ? c.archives.map((item, index) => <details key={`${item.periodStart}:${index}`}><summary>Неделя от {item.periodStart}</summary>
        {item.menu.days.map((day, dayIndex) => <div key={dayIndex}><h3>{day.day}</h3>{(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(slot => <p key={slot}>{MEAL_LABELS[slot]}: {day[slot]?.base ?? '—'}</p>)}</div>)}</details>)
        : <p>Прежних недельных меню нет.</p>}</section>}
  </section>;
}
