import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Runs production D1 SQL against SQLite, with explicit hooks for request interleavings. */
export function sqliteD1(schema = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const hooks: {
    before?: (sql: string, binds: SQLInputValue[]) => void;
    after?: (sql: string, binds: SQLInputValue[]) => void;
  } = {};
  const statements: string[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        binds: [] as SQLInputValue[],
        bind(...binds: SQLInputValue[]) { this.binds = binds; return this; },
        async all() {
          statements.push(sql);
          hooks.before?.(sql, this.binds);
          const results = sqlite.prepare(sql).all(...this.binds);
          hooks.after?.(sql, this.binds);
          return { success: true, results };
        },
        async first(column?: string) {
          statements.push(sql);
          hooks.before?.(sql, this.binds);
          const result = sqlite.prepare(sql).get(...this.binds) ?? null;
          hooks.after?.(sql, this.binds);
          return column && result ? result[column] : result;
        },
        async run() {
          statements.push(sql);
          hooks.before?.(sql, this.binds);
          const result = sqlite.prepare(sql).run(...this.binds);
          hooks.after?.(sql, this.binds);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(batch: Array<{ run: () => Promise<unknown> }>) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of batch) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: db as unknown as D1Database, sqlite, hooks, statements };
}
