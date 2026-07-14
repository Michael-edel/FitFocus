import { describe, expect, it, vi } from 'vitest';
import { deleteUserAccountAndAllData, hardDeleteAccount, softDeleteAccount } from '../functions/api/_lib/account_delete';
import type { SupportAttachmentBucket } from '../functions/api/_lib/support_attachments';

type PreparedStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => PreparedStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function makeDb(options: {
  supportRows?: Array<{ attachments_json?: string | null }>;
  ownedFamily?: { id: string } | null;
  batchReject?: Error;
  softDeleteChanges?: number;
  hardDeleteGuardChanges?: number;
  activeAdminsCount?: number;
  activeUser?: { id: string; is_active: number; deleted_at: string | null } | null;
  isAdmin?: boolean;
  isActiveAdmin?: boolean;
  activeAdminAfterGuard?: boolean;
} = {}) {
  const prepared: PreparedStatement[] = [];
  const batchedSql: string[] = [];
  const runs: Array<{ sql: string; binds: unknown[] }> = [];

  const db = {
    prepared,
    batchedSql,
    runs,
    prepare(sql: string): PreparedStatement {
      const stmt: PreparedStatement = {
        sql,
        binds: [],
        bind(...args: unknown[]) {
          this.binds = args;
          return this;
        },
        async first() {
          if (sql.includes('FROM user_roles ur') && sql.includes('WHERE ur.user_id = ?')) {
            return (options.isActiveAdmin ?? options.isAdmin) ? { x: 1 } : null;
          }
          if (sql.includes("FROM user_roles WHERE user_id = ? AND role = 'admin'")) return options.isAdmin ? { x: 1 } : null;
          if (sql.includes('SELECT COUNT(*) as c')) return { c: options.activeAdminsCount ?? 2 };
          if (sql.includes('FROM users u') && sql.includes('JOIN user_roles ur ON ur.user_id = u.id')) {
            return options.activeAdminAfterGuard ? { x: 1 } : null;
          }
          if (sql.includes('SELECT id, is_active, deleted_at FROM users WHERE id = ? LIMIT 1')) {
            return options.activeUser ?? { id: this.binds[0], is_active: 1, deleted_at: null };
          }
          if (sql.includes("FROM families WHERE owner_user_id = ? AND is_active = 1")) return null;
          if (sql.includes("FROM families WHERE owner_user_id = ? LIMIT 1")) return options.ownedFamily ?? null;
          return null;
        },
        async all() {
          if (sql.includes('FROM support_feedback')) return { results: options.supportRows ?? [] };
          return { results: [] };
        },
        async run() {
          runs.push({ sql, binds: this.binds });
          if (sql.includes('UPDATE users') && sql.includes("deletion_scheduled_at = datetime")) {
            return { success: true, meta: { changes: options.softDeleteChanges ?? 1 } };
          }
          if (sql.includes('UPDATE users') && sql.includes('SET updated_at = ?')) {
            return { success: true, meta: { changes: options.hardDeleteGuardChanges ?? 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      prepared.push(stmt);
      return stmt;
    },
    async batch(stmts: PreparedStatement[]) {
      batchedSql.push(...stmts.map((stmt) => stmt.sql));
      if (options.batchReject) throw options.batchReject;
      return stmts.map(() => ({ success: true }));
    },
  };

  return db;
}

describe('account deletion', () => {
  it('fails closed when support attachments are stored in R2 but no bucket delete is available', async () => {
    const db = makeDb({
      supportRows: [
        { attachments_json: JSON.stringify([{ name: 'a.png', mime: 'image/png', size: 1, storage_key: 'support/t/00-a.png' }]) },
      ],
    });

    const result = await deleteUserAccountAndAllData(db as unknown as D1Database, 'user-1');

    expect(result).toEqual({ ok: false, message: 'SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE' });
    expect(db.batchedSql).toEqual([]);
  });

  it('deletes support storage objects after deleting D1 rows', async () => {
    const bucket = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    };
    const db = makeDb({
      supportRows: [
        { attachments_json: JSON.stringify([{ name: 'a.png', mime: 'image/png', size: 1, storage_key: 'support/t/00-a.png' }]) },
        { attachments_json: JSON.stringify([{ name: 'b.png', mime: 'image/png', size: 1, storage_key: 'support/t/01-b.png' }]) },
      ],
    });

    const result = await deleteUserAccountAndAllData(
      db as unknown as D1Database,
      'user-1',
      false,
      undefined,
      { supportAttachments: bucket as SupportAttachmentBucket },
    );

    expect(result.ok).toBe(true);
    expect(bucket.delete).toHaveBeenCalledWith(['support/t/00-a.png', 'support/t/01-b.png']);
    expect(db.batchedSql.some((sql) => sql.includes('DELETE FROM support_feedback WHERE user_id = ?'))).toBe(true);
  });

  it('does not delete support storage objects when D1 hard delete fails', async () => {
    const bucket = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    };
    const db = makeDb({
      supportRows: [
        { attachments_json: JSON.stringify([{ name: 'a.png', mime: 'image/png', size: 1, storage_key: 'support/t/00-a.png' }]) },
      ],
      batchReject: new Error('D1 failed'),
    });

    const result = await deleteUserAccountAndAllData(
      db as unknown as D1Database,
      'user-1',
      false,
      undefined,
      { supportAttachments: bucket as SupportAttachmentBucket },
    );

    expect(result).toEqual({ ok: false, message: 'Ошибка при удалении данных пользователя.' });
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('logs hard delete failures without raw exception details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = makeDb({ batchReject: new Error('D1 failed with private details') });

    try {
      const result = await deleteUserAccountAndAllData(
        db as unknown as D1Database,
        'user-1',
        false,
        'admin-1',
      );

      expect(result).toEqual({ ok: false, message: 'Ошибка при удалении данных пользователя.' });
      expect(consoleError).toHaveBeenCalledWith('account_delete.hard_delete_failed');
      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('user-1'), expect.anything());

      const auditEvent = db.runs.find((run) => run.sql.includes('INSERT INTO admin_events'));
      expect(auditEvent).toBeTruthy();
      expect(auditEvent?.binds[3]).toBe('delete_user_atomic_failed');
      expect(auditEvent?.binds[4]).toBe('user-1');
      expect(auditEvent?.binds[5]).toBe(JSON.stringify({ error: 'ACCOUNT_HARD_DELETE_FAILED' }));
      expect(String(auditEvent?.binds[5])).not.toContain('D1 failed with private details');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('unassigns admin-owned tickets instead of deleting tickets assigned to the deleted admin', async () => {
    const db = makeDb();

    await deleteUserAccountAndAllData(db as unknown as D1Database, 'admin-1');

    expect(db.batchedSql).toContain('UPDATE support_feedback SET assigned_admin_user_id = NULL, updated_at = ? WHERE assigned_admin_user_id = ?');
    expect(db.batchedSql).not.toContain('DELETE FROM support_feedback WHERE user_id = ? OR assigned_admin_user_id = ?');
  });

  it('hardDeleteAccount throws when deleteUserAccountAndAllData returns ok=false', async () => {
    const db = makeDb({
      supportRows: [
        { attachments_json: JSON.stringify([{ name: 'a.png', mime: 'image/png', size: 1, storage_key: 'support/t/00-a.png' }]) },
      ],
    });

    await expect(hardDeleteAccount(db as unknown as D1Database, 'user-1')).rejects.toThrow('SUPPORT_ATTACHMENTS_DELETE_UNAVAILABLE');
  });

  it('softDeleteAccount guards last-admin removal inside the user update', async () => {
    const db = makeDb({ softDeleteChanges: 0, isAdmin: true });

    await expect(softDeleteAccount(db as unknown as D1Database, 'admin-1')).rejects.toThrow('Нельзя удалить аккаунт последнего администратора.');
  });

  it('softDeleteAccount batches family cleanup and session revocation after the guarded user update', async () => {
    const db = makeDb({ ownedFamily: { id: 'family-1' } });

    await softDeleteAccount(db as unknown as D1Database, 'user-1');

    expect(db.batchedSql.some((sql) => sql.includes('UPDATE families SET is_active = 0 WHERE id = ?'))).toBe(true);
    expect(db.batchedSql.some((sql) => sql.includes('DELETE FROM family_members WHERE family_id = ?'))).toBe(true);
    expect(db.batchedSql.some((sql) => sql.includes('UPDATE sessions SET revoked = 1 WHERE user_id = ?'))).toBe(true);
  });

  it('hard delete stops before R2 deletion when the guarded user update detects a last-admin race', async () => {
    const bucket = {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    };
    const db = makeDb({
      isAdmin: true,
      activeAdminsCount: 2,
      hardDeleteGuardChanges: 0,
      activeAdminAfterGuard: true,
      supportRows: [
        { attachments_json: JSON.stringify([{ name: 'a.png', mime: 'image/png', size: 1, storage_key: 'support/t/00-a.png' }]) },
      ],
    });

    const result = await deleteUserAccountAndAllData(
      db as unknown as D1Database,
      'admin-1',
      false,
      undefined,
      { supportAttachments: bucket as SupportAttachmentBucket },
    );

    expect(result).toEqual({ ok: false, message: 'Нельзя удалить последнего активного администратора.' });
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(db.batchedSql).toEqual([]);
  });

  it('hard delete allows cleanup for an admin role when the target user is not an active admin', async () => {
    const db = makeDb({ isAdmin: true, isActiveAdmin: false, activeAdminsCount: 1 });

    const result = await deleteUserAccountAndAllData(db as unknown as D1Database, 'admin-1');

    expect(result.ok).toBe(true);
    expect(db.batchedSql.some((sql) => sql.includes('DELETE FROM users WHERE id = ?'))).toBe(true);
  });
});
