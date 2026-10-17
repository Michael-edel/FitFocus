import { expect, it } from 'vitest';
import { AiActionScope } from '../features/ai/actionScope';

it('cannot run before activation and never revives an attempt after BFCache reactivation', () => {
  const scope = new AiActionScope(() => true);
  expect(scope.begin()).toBeNull(); scope.activate(); const before = scope.begin()!;
  expect(before.isCurrent()).toBe(true); scope.invalidate();
  expect(before.controller.signal.aborted).toBe(true); expect(scope.begin()).toBeNull();
  scope.activate(); expect(before.isCurrent()).toBe(false); expect(scope.begin()!.isCurrent()).toBe(true);
});
it('keeps a newer attempt active when an older request finishes', () => {
  const scope = new AiActionScope(() => true); scope.activate();
  const first = scope.begin()!, second = scope.begin()!; first.finish();
  expect(first.isCurrent()).toBe(false); expect(second.isCurrent()).toBe(true);
  scope.invalidate(); expect(second.controller.signal.aborted).toBe(true);
});
it('cannot start or apply a result after the original login closes', () => {
  let current = true; const scope = new AiActionScope(() => current); scope.activate();
  const action = scope.begin()!; current = false;
  expect(action.isCurrent()).toBe(false); expect(scope.begin()).toBeNull();
});
