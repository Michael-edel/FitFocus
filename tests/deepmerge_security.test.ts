import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const merge = createRequire(require.resolve('@rollup/plugin-node-resolve'))('deepmerge');

it('never installs attacker-controlled target or source keys as the result prototype', () => {
  const poisoned = JSON.parse('{"__proto__":{"inheritedPrivilege":true},"safe":1}');
  for (const result of [merge(poisoned, {}), merge(poisoned, poisoned), merge({ nested: poisoned }, { nested: poisoned }).nested]) {
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.inheritedPrivilege).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toEqual({ inheritedPrivilege: true });
    expect(result.safe).toBe(1);
  }
  expect(({} as Record<string, unknown>).inheritedPrivilege).toBeUndefined();
});

it('preserves deepmerge array, customMerge, clone and symbol behavior used by build consumers', () => {
  const symbol = Symbol('option');
  const target = { list: [{ old: true }], nested: { before: 1 }, [symbol]: { before: 1 } };
  const result = merge(target, { list: [{ next: true }], nested: { after: 2 }, [symbol]: { after: 2 } });
  expect(result.list).toEqual([{ old: true }, { next: true }]);
  expect(result.nested).toEqual({ before: 1, after: 2 });
  expect(result[symbol]).toEqual({ before: 1, after: 2 });
  expect(result.list[0]).not.toBe(target.list[0]);
  expect(merge({}, target, { clone: false }).list).toBe(target.list);
  expect(merge({ list: [1] }, { list: [2] }, { arrayMerge: (_a: unknown, b: unknown) => b }).list).toEqual([2]);
  expect(merge({ nested: {} }, { nested: {} }, { customMerge: (key: string) => key === 'nested' ? () => 'custom' : undefined }).nested).toBe('custom');
  expect(merge.all([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
});
