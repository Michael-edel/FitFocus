import React, { useState } from 'react';
import type { RawUnit } from '../../domain/familyPlanning';
import type { FamilyPlanningController } from './useFamilyPlanning';
import { prettyQuantity, UNIT_LABELS } from './planningUiState';

function ShoppingRow({ name, need, purchased, toBuy, unit, disabled, onChange, onRemove }: {
  name: string; need: number; purchased: number; toBuy: number; unit: RawUnit; disabled: boolean;
  onChange: (quantity: number) => Promise<boolean>; onRemove?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const value = draft ?? String(purchased);
  const bought = purchased > 0 && toBuy === 0;
  return <li className={`fp-shopping-row${bought ? ' fp-bought' : ''}`}>
    <label className="fp-option"><input type="checkbox" checked={bought} disabled={disabled || (need === 0 && purchased === 0)}
      onChange={event => void onChange(event.target.checked ? Math.max(purchased, need) : 0)} /><strong>{name}</strong></label>
    <div className="fp-shopping-amounts"><span>Нужно {prettyQuantity(need)} {UNIT_LABELS[unit]}</span>
      <span>Куплено {prettyQuantity(purchased)} {UNIT_LABELS[unit]}</span>
      <strong>Осталось купить {prettyQuantity(toBuy)} {UNIT_LABELS[unit]}</strong></div>
    {need === 0 && purchased > 0 && <p className="fp-muted fp-shopping-history">Куплено ранее; в текущем меню не требуется.</p>}
    <details><summary>Куплено другое количество</summary><form onSubmit={async event => {
      event.preventDefault(); const quantity = Number(value.replace(',', '.'));
      if (!value.trim() || !Number.isFinite(quantity) || quantity < 0) { setError('Введите количество от 0.'); return; }
      setError(''); if (await onChange(quantity)) setDraft(null);
    }}><label className="fp-field">Куплено, {UNIT_LABELS[unit]}<input type="text" inputMode="decimal" value={value}
      onChange={event => setDraft(event.target.value)} aria-invalid={!!error} /></label>
      {error && <p className="fp-error" role="alert">{error}</p>}<button type="submit" disabled={disabled}>Сохранить количество</button></form></details>
    {onRemove && <button type="button" disabled={disabled} onClick={onRemove}>Удалить ручную позицию</button>}
  </li>;
}

export function FamilyShoppingPanel({ controller: c }: { controller: FamilyPlanningController }) {
  const projection = c.projection;
  const disabled = c.commitBlocked || !!c.candidate;
  // Historical purchase records stay persisted; only inactive zero rows are omitted from this view.
  const visibleItems = projection?.items.filter(item => item.quantity > 0 || item.purchasedQuantity > 0 || item.toBuy > 0) ?? [];
  return <section className="fp-stack" aria-label="Общие покупки">
    <div className="fp-card"><h2>Покупки на {c.drafts.date}</h2><p>Общий список по подтверждённому меню. Можно отметить всё купленное или указать часть количества.</p>
      {c.candidate && <p className="fp-note">Сейчас показан список по последнему подтверждённому меню. Сначала подтвердите или отмените предпросмотр, чтобы изменить покупки.</p>}
      {c.staleRoster && <p className="fp-note">Ограничения или состав семьи изменились. Покупки относятся к прежнему меню; организатору нужно пересобрать его.</p>}
      {!projection && <p className="fp-note">Список появится после подтверждения меню на этот день.</p>}
    </div>
    {projection && <>{!visibleItems.length && <p className="fp-note">По меню на этот день покупать пока нечего.</p>}<ul className="fp-shopping-list">{visibleItems.map(item => <React.Fragment key={`${c.drafts.date}:${item.ingredientId}:${item.unit}`}><ShoppingRow
      name={item.name} need={item.quantity} purchased={item.purchasedQuantity} toBuy={item.toBuy} unit={item.unit} disabled={disabled}
      onChange={quantity => c.setPurchased(item.ingredientId, item.unit, quantity)} /></React.Fragment>)}</ul>
      <section className="fp-card"><h2>Добавлено вручную</h2>{projection.manualItems.length ? <ul className="fp-shopping-list">
        {projection.manualItems.map(item => <React.Fragment key={`${c.drafts.date}:${item.id}`}><ShoppingRow name={item.name} need={item.quantity} purchased={item.purchasedQuantity}
          toBuy={item.toBuy} unit={item.unit} disabled={disabled} onChange={quantity => c.setManualPurchased(item.id, quantity)}
          onRemove={c.owner ? () => void c.removeManual(item.id) : undefined} /></React.Fragment>)}</ul> : <p className="fp-muted">Ручных позиций пока нет.</p>}
        {c.owner ? <form onSubmit={event => { event.preventDefault(); void c.addManual(); }}>
          <h3>Добавить позицию</h3><label className="fp-field" htmlFor="fp-manual-name">Название<input id="fp-manual-name" value={c.drafts.manualName} maxLength={120}
            onChange={event => c.updateDrafts(previous => ({ ...previous, manualName: event.target.value }))} /></label>
          <div className="fp-two"><label className="fp-field" htmlFor="fp-manual-quantity">Количество<input id="fp-manual-quantity" type="text" inputMode="decimal" value={c.drafts.manualQuantity}
            onChange={event => c.updateDrafts(previous => ({ ...previous, manualQuantity: event.target.value }))} /></label>
            <label className="fp-field" htmlFor="fp-manual-unit">Единица<select id="fp-manual-unit" value={c.drafts.manualUnit}
              onChange={event => c.updateDrafts(previous => ({ ...previous, manualUnit: event.target.value as RawUnit }))}><option value="g">граммы</option><option value="ml">миллилитры</option><option value="piece">штуки</option></select></label></div>
          <button type="submit" disabled={disabled}>Добавить в покупки</button>
        </form> : <p className="fp-muted">Новые позиции добавляет организатор. Купленное могут отмечать все участники с аккаунтом.</p>}
      </section></>}
  </section>;
}
