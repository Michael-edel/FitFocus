import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_SCHEMA_VERSION as responseSchemaVersion } from '../functions/api/_lib/auth';
import { API_SCHEMA_VERSION, DATA_SCHEMA_VERSION, DB_MIGRATION_VERSION } from '../versioning';

describe('release contract', () => {
  it('publishes the latest D1 migration as the required database version', () => {
    const migrations = readdirSync('migrations')
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    expect(migrations.at(-1)).toBe(DB_MIGRATION_VERSION);
  });

  it('keeps bootstrap and generic API response schema versions aligned', () => {
    expect(API_SCHEMA_VERSION).toBe(responseSchemaVersion);
    expect(DATA_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
