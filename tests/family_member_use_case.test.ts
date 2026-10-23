import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from './_helpers/sqliteD1';
import { createFamilyInvite } from '../functions/api/_lib/family_invite_create';
import { parseFamilyMemberPatch, updateFamilyMemberProfile } from '../functions/api/_lib/family_member_profile';

describe('family member profile use case', () => {
  it('normalizes an allowed member patch', () => {
    expect(parseFamilyMemberPatch({
      goal: 'loss',
      sex: 'female',
      age: 31.9,
      height_cm: 168,
      weight_kg: 64.5,
      activity: 3,
      dietary: { allergens: ['орехи', 'Орехи'], severity: 'soft' },
    })).toEqual({
      goal: 'LOSS',
      sex: 'FEMALE',
      age: 31,
      heightCm: 168,
      weightKg: 64.5,
      activity: 3,
      restrictionsJson: '{"allergens":["орехи"],"intolerances":[],"excludedFoods":[],"severity":"soft","notes":""}',
    });
  });

  it('rejects invalid values before any database access', () => {
    expect(parseFamilyMemberPatch({ goal: 'gain' })).toEqual({ ok: false, error: 'BAD_GOAL' });
    expect(parseFamilyMemberPatch({ age: 200 })).toEqual({ ok: false, error: 'BAD_AGE' });
    expect(parseFamilyMemberPatch([])).toEqual({ ok: false, error: 'BAD_JSON' });
  });
});

describe('explicit family mutation targets against SQLite', () => {
  const userId = 'multi-family-user';
  const familyA = 'family-a';
  const familyB = 'family-b';
  let fixture: ReturnType<typeof sqliteD1>;

  // Historical rows may contain multiple active memberships from before 0022.
  // Seed the actual pre-migration schema, then install every current SQL guard
  // before exercising explicit-target behavior. Never disable guards in the tested state.
  beforeEach(() => {
    const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
    fixture=sqliteD1(schema.split('-- Dining profiles are private;')[0]);
  });
  afterEach(() => fixture.sqlite.close());
  function migrateHistoricalFixture() {
    fixture.sqlite.exec(readFileSync(new URL('../migrations/0022_family_planning.sql',import.meta.url),'utf8'));
  }

  it('updates only the targeted membership when migration preserves historical multiple-family rows', async () => {
    fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 1)').run(userId);
    fixture.sqlite.prepare('INSERT INTO families (id, owner_user_id, name, created_at) VALUES (?, ?, ?, 1)')
      .run(familyA, 'family-a-owner', 'Family A');
    fixture.sqlite.prepare('INSERT INTO families (id, owner_user_id, name, created_at) VALUES (?, ?, ?, 1)')
      .run(familyB, userId, 'Family B');
    fixture.sqlite.prepare("INSERT INTO family_members (id, family_id, user_id, role, status, goal, created_at) VALUES (?, ?, ?, 'member', 'active', 'MAINTAIN', 1)")
      .run('member-a', familyA, userId);
    fixture.sqlite.prepare("INSERT INTO family_members (id, family_id, user_id, role, status, goal, created_at) VALUES (?, ?, ?, 'owner', 'active', 'MAINTAIN', 1)")
      .run('member-b', familyB, userId);

    migrateHistoricalFixture();
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM family_dining_profiles WHERE user_id=?').get(userId))
      .toEqual({count:2});

    const result = await updateFamilyMemberProfile({ db: fixture.db, userId, familyId: familyB, body: { goal: 'LOSS' } });

    expect(result.ok).toBe(true);
    expect(fixture.sqlite.prepare('SELECT family_id, goal FROM family_members WHERE user_id = ? ORDER BY family_id').all(userId))
      .toEqual([{ family_id: familyA, goal: 'MAINTAIN' }, { family_id: familyB, goal: 'LOSS' }]);
  });

  it('does not write when the explicit membership becomes inactive before the update', async () => {
    fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 1)').run(userId);
    fixture.sqlite.prepare('INSERT INTO families (id, owner_user_id, name, created_at) VALUES (?, ?, ?, 1)')
      .run(familyB, userId, 'Family B');
    fixture.sqlite.prepare("INSERT INTO family_members (id, family_id, user_id, role, status, goal, created_at) VALUES (?, ?, ?, 'owner', 'active', 'MAINTAIN', 1)")
      .run('member-b', familyB, userId);
    migrateHistoricalFixture();
    fixture.hooks.before = sql => {
      if (sql.startsWith('UPDATE family_members')) fixture.sqlite.prepare('UPDATE family_members SET is_active = 0 WHERE family_id = ? AND user_id = ?').run(familyB, userId);
    };

    const result = await updateFamilyMemberProfile({ db: fixture.db, userId, familyId: familyB, body: { goal: 'LOSS' } });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(fixture.sqlite.prepare('SELECT goal FROM family_members WHERE family_id = ? AND user_id = ?').get(familyB, userId))
      .toEqual({ goal: 'MAINTAIN' });
  });

  it('creates an invite only for the explicitly targeted family that the caller owns', async () => {
    fixture.sqlite.prepare('INSERT INTO users (id, created_at) VALUES (?, 1)').run(userId);
    fixture.sqlite.prepare('INSERT INTO families (id, owner_user_id, name, created_at) VALUES (?, ?, ?, 1)')
      .run(familyA, 'family-a-owner', 'Family A');
    fixture.sqlite.prepare('INSERT INTO families (id, owner_user_id, name, created_at) VALUES (?, ?, ?, 1)')
      .run(familyB, userId, 'Family B');
    fixture.sqlite.prepare("INSERT INTO family_members (id, family_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'member', 'active', 1)")
      .run('member-a', familyA, userId);
    fixture.sqlite.prepare("INSERT INTO family_members (id, family_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'owner', 'active', 1)")
      .run('member-b', familyB, userId);
    fixture.sqlite.prepare("INSERT INTO subscriptions (user_id, plan, status, updated_at) VALUES (?, 'family', 'active', 1)").run(userId);
    migrateHistoricalFixture();

    const result = await createFamilyInvite({ db: fixture.db, userId, familyId: familyB, body: { ttlHours: 1 } });

    expect(result.ok).toBe(true);
    expect(fixture.sqlite.prepare('SELECT family_id FROM family_invites').get()).toEqual({ family_id: familyB });
    await expect(createFamilyInvite({ db: fixture.db, userId, familyId: familyA, body: { ttlHours: 1 } })).rejects.toThrow('FORBIDDEN');
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM family_invites').get()).toEqual({ count: 1 });
  });
});
