import { describe, expect, it } from 'vitest';
import { parsePlanTaskState } from '../features/plan/usePlanTaskState';

describe('plan task feature', () => {
  it('restores valid completed task flags', () => {
    expect(parsePlanTaskState('{"2026-10-07:water":true,"2026-10-07:steps":false}')).toEqual({
      '2026-10-07:water': true,
      '2026-10-07:steps': false,
    });
  });

  it('resets missing, malformed, and mixed task values', () => {
    expect(parsePlanTaskState(null)).toEqual({});
    expect(parsePlanTaskState('{bad-json')).toEqual({});
    expect(parsePlanTaskState('{"water":"yes"}')).toEqual({});
  });
});
