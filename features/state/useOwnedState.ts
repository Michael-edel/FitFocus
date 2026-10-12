import { useCallback, useEffect, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { StateEditor, type StateCodec } from '../../storage/stateEditor';
import { UserStateRepository, type UserStateKey } from '../../storage/userStateRepository';
import type { OutboxCommitGuard } from '../../storage/durableOutbox';

/** Captured callbacks keep their original account/editor, including after a profile switch. */
export function useOwnedState<T>(accountId: string | null | undefined, key: UserStateKey, initial: T, codec: StateCodec<T>) {
  // The initial value belongs to this editor; changing unrelated profile fields must not reload it.
  const editor = useMemo(() => new StateEditor(accountId ? new UserStateRepository(accountId) : null, key, initial, codec), [accountId, key, codec]);
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => { void editor.load(); }, [editor]);
  const setValue: Dispatch<SetStateAction<T>> = useCallback((action) => { void editor.set(action).catch(() => {}); }, [editor]);
  const persist = useCallback((value: T) => editor.set(value), [editor]);
  const persistGenerated = useCallback((value: T | ((previous: T) => T), guard: OutboxCommitGuard) => editor.commitGenerated(value, guard), [editor]);
  const remove = useCallback(() => editor.remove(), [editor]);
  return { value: snapshot.value, setValue, persist, persistGenerated, remove, ready: snapshot.phase === 'ready' };
}
