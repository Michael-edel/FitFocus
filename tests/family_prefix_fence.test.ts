import { describe, expect, it } from 'vitest';
import { PREFIX_FENCE_SCHEMA, prepareFamilyPrefixBatch } from '../functions/api/_lib/family_prefix_fence';

// Control-flow/schema contract only. Real SQL rollback/TOCTOU is a separate D1 gate.
function fixture(options: { absent?: boolean; disabled?: boolean; revision?: number; readError?: boolean;
  mutate?: (objects: Array<{ name: string; type: string; tbl_name: string; sql: string }>) => void } = {}) {
  const objects = Object.entries(PREFIX_FENCE_SCHEMA).map(([name, definition]) => ({ name, ...definition }));
  options.mutate?.(objects);
  const writes: string[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql, values: [] as unknown[],
        bind(...values: unknown[]) { statement.values = values; return statement; },
        async all() {
          if (options.readError) throw new Error('synthetic metadata read failure');
          let results: unknown[];
          if (sql.includes('FROM sqlite_master')) results = options.absent ? [] : objects;
          else if (sql === 'SELECT * FROM family_prefix_fence_control') results = [{ singleton: 1, approved_revision: options.revision ?? 1, bridge_enabled: options.disabled ? 0 : 1 }];
          else if (sql === 'PRAGMA foreign_keys') results = [{ foreign_keys: 1 }];
          else if (sql === 'PRAGMA foreign_key_list(family_prefix_fence_token)') results = [{ id: 0, seq: 0, table: 'family_prefix_fence_must_stay_empty', from: 'must_absent_id', to: 'id', on_update: 'NO ACTION', on_delete: 'NO ACTION', match: 'NONE' }];
          else if (sql.includes('LIMIT 1')) results = [];
          else throw new Error('Unexpected metadata query');
          return { success: true, results };
        },
        async run() { writes.push(sql); throw new Error('Split writes forbidden'); },
      };
      return statement;
    },
    async batch() { throw new Error('Adapter must return a plan, not execute writes'); },
  };
  return { db: db as unknown as D1Database, writes };
}
const create = { operation: 'create' as const, verifiedUserId: 'verified-owner', targetFamilyId: 'server-family', requestId: 'server-request', memberId: 'server-member', name: 'Family' as string | undefined, inviteCode: undefined as string | undefined, nowSeconds: 2_000_000_000 };
const join = { ...create, operation: 'join' as const, name: undefined, inviteCode: 'INVITE' };
const inspect = (plan: D1PreparedStatement[]) => plan as unknown as Array<{ sql: string; values: unknown[] }>;

describe('prefix-aware bridge admission contract', () => {
  for (const input of [create, join]) {
    it(`${input.operation}: absence produces one bare business plan with an intrinsic assertion and no missing prefix table`, async () => {
      const { db, writes } = fixture({ absent: true });
      const plan = inspect(await prepareFamilyPrefixBatch(db, input));
      expect(plan).toHaveLength(3);
      expect(plan[2].sql).toContain('ELSE abs(-9223372036854775808)');
      expect(plan.every(item => !/(?:FROM|INTO|UPDATE)\s+family_prefix_/i.test(item.sql))).toBe(true);
      expect(writes).toEqual([]);
    });
    it(`${input.operation}: exact optional FK contract produces token/business/assert/delete with owned bindings`, async () => {
      const { db, writes } = fixture();
      const plan = inspect(await prepareFamilyPrefixBatch(db, input));
      expect(plan).toHaveLength(5);
      expect(plan[0].sql).toContain('INSERT INTO family_prefix_fence_token');
      expect(plan[0].values).toEqual([1, 1, input.operation, input.requestId, input.verifiedUserId, input.targetFamilyId, input.inviteCode ?? null]);
      expect(plan[3].sql).toContain('UPDATE family_prefix_fence_token SET permitted=CASE');
      expect(plan[4].values).toEqual([input.requestId, input.verifiedUserId, input.targetFamilyId]);
      expect(writes).toEqual([]);
    });
  }
  for (const [label, options] of [
    ['disabled', { disabled: true }], ['unknown revision', { revision: 2 }],
    ['partial', { mutate: (objects: Array<{ name: string }>) => { objects.pop(); } }],
    ['base token without deferred FK', { mutate: (objects: Array<{ name: string }>) => { objects.splice(objects.findIndex(item => item.name === 'family_prefix_fence_must_stay_empty'), 1); } }],
    ['changed guard', { mutate: (objects: Array<{ name: string; sql: string }>) => { objects.find(item => item.name === 'family_prefix_create_guard')!.sql += ' /* drift */'; } }],
  ] as const) {
    it(`fails closed for ${label}`, async () => {
      const { db, writes } = fixture(options);
      await expect(prepareFamilyPrefixBatch(db, create)).rejects.toThrow('FAMILY_ATOMIC_WRITER_REQUIRED');
      expect(writes).toEqual([]);
    });
  }
  it('propagates a metadata read failure without interpreting it as absent', async () => {
    const { db, writes } = fixture({ readError: true });
    await expect(prepareFamilyPrefixBatch(db, create)).rejects.toThrow('synthetic metadata read failure');
    expect(writes).toEqual([]);
  });
});
