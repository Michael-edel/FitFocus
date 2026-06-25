import { describe, expect, it } from 'vitest';
import { consumeInviteCode } from '../functions/api/_lib/invites';

type RunResult = { changes?: number; meta?: { changes?: number } };

function makeDb(options: { existing?: boolean; insertChanges?: number; updateChanges?: number } = {}) {
  const calls: string[] = [];
  return {
    calls,
    prepare(sql: string) {
      return {
        binds: [] as unknown[],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          calls.push(sql);
          if (sql.includes('FROM invite_redemptions') && options.existing) return { ok: 1 };
          return null;
        },
        async run(): Promise<RunResult> {
          calls.push(sql);
          if (sql.includes('UPDATE invite_codes') && sql.includes('uses = uses + 1')) {
            return { meta: { changes: options.updateChanges ?? 1 } };
          }
          if (sql.includes('INSERT OR IGNORE INTO invite_redemptions')) {
            return { meta: { changes: options.insertChanges ?? 1 } };
          }
          if (sql.includes('uses = MAX(0, uses - 1)')) return { meta: { changes: 1 } };
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

describe('consumeInviteCode', () => {
  it('does not increment uses for an already redeemed invite', async () => {
    const db = makeDb({ existing: true });
    const result = await consumeInviteCode(db as any, 'INVITE', 'user-1', 123);

    expect(result).toEqual({ ok: true, already: true });
    expect(db.calls.some((sql) => sql.includes('uses = uses + 1'))).toBe(false);
  });

  it('returns invalid when invite capacity update does not change a row', async () => {
    const db = makeDb({ updateChanges: 0 });
    const result = await consumeInviteCode(db as any, 'INVITE', 'user-1', 123);

    expect(result).toEqual({ ok: false, error: 'INVITE_INVALID' });
    expect(db.calls.some((sql) => sql.includes('INSERT OR IGNORE INTO invite_redemptions'))).toBe(false);
  });

  it('rolls back the uses increment when redemption insert is ignored', async () => {
    const db = makeDb({ insertChanges: 0 });
    const result = await consumeInviteCode(db as any, 'INVITE', 'user-1', 123);

    expect(result).toEqual({ ok: true, already: true });
    expect(db.calls.some((sql) => sql.includes('uses = MAX(0, uses - 1)'))).toBe(true);
  });
});
