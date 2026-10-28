import React, { useEffect, useRef } from 'react';
import { FAMILY_ALLERGENS, FAMILY_INGREDIENTS } from '../../domain/familyPlanningCatalog';
import type { FamilyPlanningController } from './useFamilyPlanning';

const toggle = (values: string[], id: string, checked: boolean) => checked ? [...new Set([...values, id])] : values.filter(value => value !== id);

export function FamilyProfileEditor({ controller: c }: { controller: FamilyPlanningController }) {
  const draft = c.drafts.profile;
  const nameInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (c.drafts.profileOpen) nameInput.current?.focus(); }, [c.drafts.profileOpen, draft?.id]);
  if (!draft) return null;
  const errors = c.fieldErrors;
  return <section className="fp-card fp-editor" hidden={!c.drafts.profileOpen} aria-labelledby="fp-profile-heading">
    <div className="fp-heading-row"><h2 id="fp-profile-heading">{draft.id ? 'Профиль участника' : 'Профиль без аккаунта'}</h2>
      <button type="button" onClick={c.closeProfile}>Назад</button></div>
    <p className="fp-muted">Укажите имя, взрослый это или ребёнок, и известные аллергии. Рост и вес не нужны. Долю порции можно оставить предложенной или изменить. Изменения станут общими после сохранения на сервере.</p>
    <form onSubmit={event => { event.preventDefault(); void c.saveProfile(); }} noValidate>
      <label className="fp-field" htmlFor="fp-profile-name">Имя
        <input ref={nameInput} id="fp-profile-name" value={draft.displayName} maxLength={80} autoComplete="off"
          onChange={event => c.patchProfile({ displayName: event.target.value })}
          aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? 'fp-name-error' : undefined} />
      </label>
      {errors.displayName && <p className="fp-error" id="fp-name-error">{errors.displayName}</p>}
      <fieldset><legend>Взрослый или ребёнок</legend><div className="fp-two">
        <label className="fp-option"><input type="radio" name="fp-age-group" checked={draft.ageGroup === 'adult'} onChange={() => c.patchProfile({ ageGroup: 'adult' })} />Взрослый</label>
        <label className="fp-option"><input type="radio" name="fp-age-group" checked={draft.ageGroup === 'child'} onChange={() => c.patchProfile({ ageGroup: 'child' })} />Ребёнок</label>
      </div></fieldset>
      {errors.ageGroup && <p className="fp-error">{errors.ageGroup}</p>}
      <fieldset><legend>Ручная доля базовой порции</legend><div className="fp-three">
        {([0.75, 1, 1.25] as const).map(share => <button key={share} type="button" className={draft.portionShare === share ? 'fp-selected' : ''}
          aria-pressed={draft.portionShare === share} onClick={() => c.patchProfile({ portionShare: share })}>{share.toLocaleString('ru-RU')} порции</button>)}
      </div><p className="fp-muted">Можно изменить отдельно для любого приёма пищи.</p></fieldset>
      <fieldset><legend>Аллергии</legend>
        <div className="fp-stack">{([{ value: 'unknown', text: 'Пока не знаю' }, { value: 'none', text: 'Нет известных аллергий' }, { value: 'list', text: 'Есть аллергии' }] as const).map(option =>
          <label className="fp-option" key={option.value}><input type="radio" name="fp-allergy-state" checked={draft.allergyState === option.value}
            onChange={() => c.patchProfile({ allergyState: option.value })} />{option.text}</label>)}</div>
        {draft.allergyState === 'unknown' && <p className="fp-note">Профиль можно сохранить. Подтверждение меню с этим участником будет доступно после уточнения аллергий.</p>}
        {draft.allergyState === 'list' && <div className="fp-check-grid">{FAMILY_ALLERGENS.map(item => <label className="fp-option" key={item.id}>
          <input type="checkbox" checked={draft.allergenIds.includes(item.id)} onChange={event => c.patchProfile({ allergenIds: toggle(draft.allergenIds, item.id, event.target.checked) })} />{item.name}
        </label>)}</div>}
        {errors.allergies && <p className="fp-error">{errors.allergies}</p>}
      </fieldset>
      <details className="fp-profile-extra"><summary>Дополнительные настройки (необязательно) · исключений {draft.hardExcludedIngredientIds.length}, пожеланий {draft.dislikedIngredientIds.length}</summary>
        <p className="fp-muted">Строгие исключения запрещают продукт, «не нравится» — только пожелание.</p>
      {draft.ageGroup === 'adult' && <label className="fp-field" htmlFor="fp-goal-context">Личная цель (необязательно)
        <select id="fp-goal-context" value={draft.goalContext} onChange={event => c.patchProfile({ goalContext: event.target.value as typeof draft.goalContext })}>
          <option value="">Не указывать</option><option value="LOSS">Снижение</option><option value="MAINTAIN">Поддержание</option><option value="GAIN">Набор</option>
        </select><span className="fp-muted">Личный контекст. Он не назначает калории и не меняет размер порции автоматически.</span>
      </label>}
      <details open={draft.hardExcludedIngredientIds.length > 0 || undefined}><summary>Строго исключить продукты ({draft.hardExcludedIngredientIds.length})</summary>
        <p className="fp-muted">Эти продукты нельзя включать в общее блюдо.</p>
        <div className="fp-check-grid">{FAMILY_INGREDIENTS.map(item => <label key={item.id} className="fp-option"><input type="checkbox"
          checked={draft.hardExcludedIngredientIds.includes(item.id)} onChange={event => c.patchProfile({ hardExcludedIngredientIds: toggle(draft.hardExcludedIngredientIds, item.id, event.target.checked) })} />{item.name}</label>)}</div>
      </details>
      <details open={draft.dislikedIngredientIds.length > 0 || undefined}><summary>Не нравится ({draft.dislikedIngredientIds.length})</summary>
        <p className="fp-muted">Пожелания учитываются отдельно и не ослабляют строгие ограничения.</p>
        <div className="fp-check-grid">{FAMILY_INGREDIENTS.map(item => <label key={item.id} className="fp-option"><input type="checkbox"
          checked={draft.dislikedIngredientIds.includes(item.id)} onChange={event => c.patchProfile({ dislikedIngredientIds: toggle(draft.dislikedIngredientIds, item.id, event.target.checked) })} />{item.name}</label>)}</div>
      </details>
      </details>
      {errors.form && <p className="fp-error" role="alert">{errors.form}</p>}
      <div className="fp-actions"><button className="fp-primary" type="submit" disabled={!!c.busy}>Сохранить профиль</button>
        <button type="button" onClick={c.closeProfile}>Закрыть, сохранив черновик</button>
        <button type="button" disabled={!!c.busy} onClick={c.discardProfile}>Отменить изменения</button></div>
    </form>
  </section>;
}
