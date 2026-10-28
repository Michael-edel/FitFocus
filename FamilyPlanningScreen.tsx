import React from 'react';
import { useFamilyPlanning, type FamilyPlanningOptions } from './features/familyPlanning/useFamilyPlanning';
import { FamilyRosterPanel } from './features/familyPlanning/FamilyRosterPanel';
import { FamilyProfileEditor } from './features/familyPlanning/FamilyProfileEditor';
import { FamilyDayPanel } from './features/familyPlanning/FamilyDayPanel';
import { FamilyShoppingPanel } from './features/familyPlanning/FamilyShoppingPanel';
import { FamilyConflictView } from './features/familyPlanning/FamilyConflictView';
import { MEAL_LABELS, type PlanningView } from './features/familyPlanning/planningUiState';
import './features/familyPlanning/familyPlanning.css';

export type FamilyPlanningScreenProps = FamilyPlanningOptions & {
  currentView: PlanningView;
  onViewChange?: (view: PlanningView) => void;
  onOpenPersonal?: () => void;
  onOpenPlans?: () => void;
};

export default function FamilyPlanningScreen(props: FamilyPlanningScreenProps) {
  const c = useFamilyPlanning(props);
  const titles = { today: 'Сегодня', menu: 'Меню семьи', shopping: 'Покупки' };
  const navigate = (view: PlanningView) => props.onViewChange?.(view);
  if (!props.loginGuard || props.allowCachedUiStateRestore === false) return <section className="fp-root fp-card" role="status">
    <h1>{titles[props.currentView]}</h1><p>Не удалось подтвердить доступ к семейным данным. Подключитесь к сети и обновите страницу. Сохранённые данные не изменены.</p>
    {props.onOpenPersonal && <button type="button" onClick={props.onOpenPersonal}>Личный режим</button>}
  </section>;
  return <div className="fp-root">
    <header className="fp-heading-row"><div><p className="fp-eyebrow">Семейный режим</p><h1>{titles[props.currentView]}</h1></div>
      {props.onOpenPersonal && <button type="button" onClick={props.onOpenPersonal}>Личный режим</button>}</header>
    <div className={`fp-status fp-status-${c.delivery.kind}`} role="status" aria-live="polite">
      <p>{c.busy ? `${c.busy}…` : c.delivery.message}</p>
      {['local', 'sending', 'error', 'conflict'].includes(c.delivery.kind) && <button type="button" onClick={() => void c.sync()} disabled={!!c.busy}>Проверить синхронизацию</button>}
    </div>
    {c.error && <div className="fp-error fp-card" role="alert"><p>{c.error}</p><button type="button" onClick={() => void c.refresh()} disabled={!!c.busy}>Обновить данные</button>
      {props.onOpenPlans && c.error.includes('тариф') && <button type="button" onClick={props.onOpenPlans}>Открыть тарифы</button>}</div>}
    {c.delivery.kind === 'conflict' && <section className="fp-card"><h2>Две версии меню</h2><p>Локальный вариант остаётся сохранённым. Повторная отправка не перезапишет конфликт автоматически.</p>
      <FamilyConflictView local={c.conflictLocal} remote={c.delivery.remote} members={c.roster?.profiles} />
      <div className="fp-actions"><button type="button" onClick={c.exportLocal}>Сохранить копию своего варианта</button>
        <button type="button" onClick={() => void c.acceptServer()} disabled={!!c.busy || !c.delivery.remote}>Оставить серверную версию</button></div>
    </section>}
    <div hidden={props.currentView !== 'today'} className="fp-stack">
      {c.family && <section className="fp-card"><h2>{c.currentPlan ? 'Меню готово к просмотру' : 'Подготовим день вместе'}</h2>
        <p>{c.roster?.planningConstraints.incomplete ? 'Сначала уточните профили и ограничения участников.'
          : c.currentPlan ? `План на ${c.drafts.date}. Блюда общие, порции — для каждого.` : 'Состав семьи готов. Выберите порции и посмотрите меню на один день.'}</p>
        {c.staleRoster && <p className="fp-note">Состав или ограничения изменились. Меню нужно пересобрать.</p>}
        {c.currentPlan && <ul className="fp-portions">{c.currentPlan.planningV1.meals.map(meal => <li key={meal.id}><strong>{MEAL_LABELS[meal.slot]}</strong><span>{c.currentPlan!.planningV1.recipes.find(recipe => recipe.recipeId === meal.recipeId)?.title}</span></li>)}</ul>}
        <div className="fp-actions"><button className="fp-primary" type="button" onClick={() => navigate('menu')}>Открыть меню семьи</button>
          <button type="button" onClick={() => navigate('shopping')}>Общие покупки</button></div>
      </section>}
    </div>
    <div hidden={props.currentView === 'shopping'} className="fp-stack"><FamilyRosterPanel controller={c} />{c.family && c.roster && <FamilyProfileEditor controller={c} />}</div>
    <div hidden={props.currentView !== 'menu'}><FamilyDayPanel controller={c} /></div>
    <div hidden={props.currentView !== 'shopping'}><FamilyShoppingPanel controller={c} /></div>
    <p className="fp-draft-note" role="status">{c.draftNotice}</p>
  </div>;
}
