import { parseJson } from '../../safeJson';
import { useOwnedState } from '../state/useOwnedState';
import type { StateCodec } from '../../storage/stateEditor';

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'boolean');
}

export function parsePlanTaskState(raw: string | null): Record<string, boolean> {
  const parsed = raw ? parseJson(raw) : null;
  return isBooleanRecord(parsed) ? parsed : {};
}

const planTaskCodec: StateCodec<Record<string, boolean>> = { decode: (raw) => parsePlanTaskState(raw), encode: JSON.stringify };

/** Each editor retains its observed revision; hydration never creates a write. */
export function usePlanTaskState(userId: string | null | undefined) {
  const state = useOwnedState(userId, 'plan_task_done', {}, planTaskCodec);
  return { planTaskDone: state.value, setPlanTaskDone: state.setValue };
}
