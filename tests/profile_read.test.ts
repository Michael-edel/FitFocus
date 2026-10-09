import { describe, expect, it } from 'vitest';
import { loadCurrentProfile } from '../functions/api/_lib/profile_read';

function makeDb() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.startsWith('SELECT profile_json, version FROM user_profiles')) {
            return {
              profile_json: JSON.stringify({ id: 'client-id', name: 'Анна', plan: 'free' }),
              version: 4,
            };
          }
          if (sql.includes('FROM subscriptions')) return { plan: 'family' };
          throw new Error(`Unexpected SELECT: ${sql}`);
        },
      };
    },
  } as unknown as D1Database;
}

describe('profile read use case', () => {
  it('returns the stored profile with server-owned identity and subscription plan', async () => {
    const profile = await loadCurrentProfile(makeDb(), {
      sub: 'user-1',
      email: 'anna@example.com',
      name: 'Анна из входа',
    });

    expect(profile).toMatchObject({
      id: 'user-1',
      googleSub: 'user-1',
      email: 'anna@example.com',
      name: 'Анна',
      plan: 'family',
      planTier: 'pro',
      version: 4,
    });
  });
});
