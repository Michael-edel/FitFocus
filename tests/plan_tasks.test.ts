import { describe, expect, it } from 'vitest';
import { togglePlanTask } from '../features/plan/planTasks';

describe('plan task use case', () => {
  it('toggles only the requested task without reordering the plan', () => {
    const tasks = [
      { date: '2026-10-07', title: 'A', completed: false },
      { date: '2026-10-08', title: 'B', completed: true },
    ];
    expect(togglePlanTask(tasks, '2026-10-07')).toEqual([
      { date: '2026-10-07', title: 'A', completed: true },
      { date: '2026-10-08', title: 'B', completed: true },
    ]);
    expect(togglePlanTask(undefined, '2026-10-07')).toBeNull();
  });
});