import { expect, it, vi } from 'vitest';
import { ProfileDraftSave } from '../features/settings/profileDraftSave';

function gate() {
  let release!: (value: boolean) => void;
  const wait = new Promise<boolean>(resolve => { release = resolve; });
  return { wait, release };
}
function callbacks(save: () => Promise<boolean>) {
  return { submissionKey: 'account/session/draft/edit-1', save, isCurrent: () => true, setBusy: vi.fn(), saved: vi.fn(), failed: vi.fn() };
}

it.each(['cloud', 'local'])('blocks a second %s save synchronously and permits a later explicit save', async () => {
  const save = new ProfileDraftSave(), pending = gate();
  const input = callbacks(vi.fn(() => pending.wait));
  const first = save.run(input);
  expect(save.busy).toBe(true);
  await save.run(input);
  expect(input.save).toHaveBeenCalledTimes(1);
  pending.release(true); await first;
  expect(input.saved).toHaveBeenCalledTimes(1);
  expect(input.setBusy.mock.calls).toEqual([[true], [false]]);
  await save.run({ ...input, submissionKey: 'account/session/draft/edit-2', save: async () => true });
  expect(input.saved).toHaveBeenCalledTimes(2);
});

it.each(['false', 'reject'])('retains the dirty draft and permits retry after %s', async outcome => {
  const save = new ProfileDraftSave(); let dirty = true;
  const input = callbacks(async () => { if (outcome === 'reject') throw new Error('quota'); return false; });
  input.saved = vi.fn(() => { dirty = false; });
  await save.run(input);
  expect(dirty).toBe(true); expect(input.failed).toHaveBeenCalledOnce();
  expect(save.busy).toBe(false);
  await save.run({ ...input, save: async () => true });
  expect(dirty).toBe(false);
});

it('does not clear a newer draft edited while the durable save is pending', async () => {
  const save = new ProfileDraftSave(), pending = gate();
  let draft = '75', dirty = true;
  const submitted = draft;
  const input = callbacks(() => pending.wait);
  input.saved = vi.fn(() => { if (draft === submitted) dirty = false; });
  const first = save.run(input); draft = '76';
  pending.release(true); await first;
  expect(draft).toBe('76'); expect(dirty).toBe(true);
});

it.each([true, false])('discards a late %s result after account/session changes', async success => {
  const save = new ProfileDraftSave(), pending = gate(); let current = true;
  const input = { ...callbacks(() => pending.wait), isCurrent: () => current };
  const first = save.run(input); current = false;
  pending.release(success); await first;
  expect(input.saved).not.toHaveBeenCalled(); expect(input.failed).not.toHaveBeenCalled();
  expect(save.busy).toBe(false);
});

it('does not submit an unchanged completed form twice even when the first save resolves immediately', async () => {
  const save = new ProfileDraftSave();
  const input = callbacks(vi.fn(async () => true));
  await save.run(input);
  await save.run(input);
  expect(input.save).toHaveBeenCalledTimes(1);
  expect(input.saved).toHaveBeenCalledTimes(1);
});

it('permits an intentional return to the same values after a new edit revision', async () => {
  const save = new ProfileDraftSave();
  const input = callbacks(vi.fn(async () => true));
  await save.run(input);
  await save.run({ ...input, submissionKey: 'account/session/draft/edit-3' });
  expect(input.save).toHaveBeenCalledTimes(2);
});

it('permits the same draft in a new verified session', async () => {
  const save = new ProfileDraftSave();
  const input = callbacks(vi.fn(async () => true));
  await save.run(input);
  await save.run({ ...input, submissionKey: 'account/new-session/draft/edit-1' });
  expect(input.save).toHaveBeenCalledTimes(2);
});

it('keeps a draft dirty when edits during save return to the submitted values', async () => {
  const save = new ProfileDraftSave(), pending = gate();
  let draft = '75', revision = 1, dirty = true;
  const submittedDraft = draft, submittedRevision = revision;
  const input = callbacks(vi.fn(() => pending.wait));
  input.saved = vi.fn(() => {
    if (draft === submittedDraft && revision === submittedRevision) dirty = false;
  });
  const first = save.run(input);
  draft = '76'; revision += 1;
  draft = '75'; revision += 1;
  pending.release(true); await first;
  expect(dirty).toBe(true);
  await save.run({ ...input, submissionKey: `account/session/draft/edit-${revision}`, save: async () => true });
  expect(input.saved).toHaveBeenCalledTimes(2);
});
