import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { FamilyActionScope } from './actionScope';

/** A captured setter retains the login and target that created it. */
export function useFamilyState<T>(scope: FamilyActionScope, initial: T, key = ''): [T, Dispatch<SetStateAction<T>>] {
  const owner = useRef({ scope, key }); owner.current = { scope, key };
  const [state, setState] = useState({ scope, key, value: initial });
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(update => {
    const current = () => scope.isCurrent() && owner.current.scope === scope && owner.current.key === key;
    if (!current()) return;
    setState(previous => {
      if (!current()) return previous;
      const value = previous.scope === scope && previous.key === key ? previous.value : initial;
      return { scope, key, value: typeof update === 'function' ? (update as (value: T) => T)(value) : update };
    });
  }, [initial, key, scope]);
  return [state.scope === scope && state.key === key ? state.value : initial, setValue];
}
