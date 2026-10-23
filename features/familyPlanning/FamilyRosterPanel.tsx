import React, { useState } from 'react';
import type { FamilyPlanningController } from './useFamilyPlanning';

export function FamilyRosterPanel({ controller: c }: { controller: FamilyPlanningController }) {
  const [copyNotice, setCopyNotice] = useState('');
  if (!c.family) return <section className="fp-card" aria-labelledby="fp-create-heading">
    <h2 id="fp-create-heading">Одно меню для вашей семьи</h2>
    <p>Общие блюда, ручные порции для каждого и один список покупок. Профили близких можно вести без отдельных аккаунтов.</p>
    <form onSubmit={event => { event.preventDefault(); void c.create(); }}>
      <label className="fp-field" htmlFor="fp-family-name">Название семьи<input id="fp-family-name" maxLength={60} value={c.drafts.familyName}
        onChange={event => c.updateDrafts(previous => ({ ...previous, familyName: event.target.value }))} /></label>
      <button className="fp-primary" type="submit" disabled={!!c.busy || !c.drafts.familyName.trim()}>Создать семью</button>
    </form>
    <details><summary>У меня есть код приглашения</summary><form onSubmit={event => { event.preventDefault(); void c.join(); }}>
      <label className="fp-field" htmlFor="fp-family-code">Код приглашения<input id="fp-family-code" value={c.drafts.joinCode} maxLength={100} autoComplete="off"
        onChange={event => c.updateDrafts(previous => ({ ...previous, joinCode: event.target.value }))} /></label>
      <button type="submit" disabled={!!c.busy || !c.drafts.joinCode.trim()}>Присоединиться</button>
    </form></details>
  </section>;
  const members = c.roster?.profiles.filter(profile => profile.active) ?? [];
  return <section className="fp-card" aria-labelledby="fp-roster-heading">
    <div className="fp-heading-row"><div><h2 id="fp-roster-heading">{c.family.name}</h2><p className="fp-muted">{members.length} из 5 человек · включая организатора</p></div>
      <button type="button" disabled={!!c.busy} onClick={() => void c.refresh()}>Обновить данные</button></div>
    <ul className="fp-roster">{members.map(profile => <li key={profile.id}><div><strong>{profile.displayName}</strong>
      <span className="fp-muted">{profile.kind === 'managed' ? 'Профиль без аккаунта' : 'Участник с аккаунтом'}</span></div>
      {profile.canEdit ? <button type="button" onClick={() => void c.editProfile(profile.id)} disabled={!!c.busy}>Настроить профиль</button>
        : <span className="fp-muted">Настраивает сам участник</span>}</li>)}</ul>
    {c.owner && <div className="fp-actions"><button type="button" className="fp-primary" onClick={() => void c.editProfile(null)} disabled={!!c.busy || members.length >= 5}>Добавить профиль без аккаунта</button>
      <button type="button" onClick={() => void c.invite()} disabled={!!c.busy || members.length >= 5}>Пригласить по коду</button></div>}
    {members.length >= 5 && <p className="fp-note">В семье 5 человек. Общий лимит включает аккаунты и профили без аккаунта.</p>}
    {c.inviteCode && <div className="fp-note"><p>Отправьте этот код человеку с аккаунтом. Участник появится после принятия приглашения.</p><p className="fp-code">{c.inviteCode}</p>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(c.inviteCode); setCopyNotice('Код скопирован.'); }
        catch { setCopyNotice('Не удалось скопировать. Выделите код и скопируйте вручную.'); } }}>Скопировать код</button>
      <p role="status">{copyNotice}</p></div>}
    {c.profileNotice && <p className="fp-note" role="status">{c.profileNotice}</p>}
    {c.roster?.planningConstraints.incomplete && <p className="fp-note">Ограничения ещё не уточнены. Настройте доступные вам профили; участники с аккаунтом заполняют свои данные сами.</p>}
  </section>;
}
