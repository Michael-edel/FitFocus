import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../types';
import { togglePlanTask } from '../features/plan/planTasks';

describe('plan task use case', () => {
  it('toggles only the requested task without reordering the plan', () => {
    const tasks: NonNullable<UserProfile['tasks']> = [
      { date: '2026-10-07', text: 'A', completed: false },
      { date: '2026-10-08', text: 'B', completed: true },
    ];
    expect(togglePlanTask(tasks, '2026-10-07')).toEqual([
      { date: '2026-10-07', text: 'A', completed: true },
      { date: '2026-10-08', text: 'B', completed: true },
    ]);
    expect(togglePlanTask(undefined, '2026-10-07')).toBeNull();
  });
});