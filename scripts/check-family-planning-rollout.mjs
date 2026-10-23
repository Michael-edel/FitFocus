import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { verifyReleaseArtifact } from './release-artifact.mjs';

// Run only inside the parent's disposable, network-isolated OS sandbox.
// Every D1 command explicitly uses --local with a new scratch config/database ID.
assert.equal(process.argv.length, 4, 'Usage: node scripts/check-family-planning-rollout.mjs --candidate <verified C artifact>');
assert.equal(process.argv[2], '--candidate');
const candidate = resolve(process.argv[3]), manifest = verifyReleaseArtifact(candidate);
assert.equal(manifest.format, 2); assert.equal(manifest.compatibility.d1Migration, '0022_family_planning.sql');
const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const root = mkdtempSync(resolve(tmpdir(), 'fitfocus-planning-rollout-'));
const deadline = Date.now() + 180_000;
const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
const budget = () => { const remaining = deadline - Date.now(); assert(remaining > 0, 'Local rollout check exceeded its 180s budget'); return Math.min(45_000, remaining); };
const run = (file, args, options = {}) => execFileSync(file, args, { cwd: root, env, encoding: 'utf8', timeout: budget(), maxBuffer: 4 * 1024 * 1024, ...options });
assert.equal(run(process.execPath, [cli, '--version']).trim(), '4.149.0', 'Use the pinned Wrangler toolchain');
const source = resolve(root, 'candidate-source'); mkdirSync(source);
run('tar', ['-xf', resolve(candidate, 'source.tar'), '-C', source]);
const migrations = readdirSync(resolve(source, 'migrations')).filter(name => /^\d.*\.sql$/.test(name)).sort();
const migration = '0022_family_planning.sql', boundary = migrations.indexOf(migration);
assert.equal(boundary, migrations.length - 1, 'This check is specific to the reviewed 0021 → 0022 transition');
assert(boundary > 0 && migrations[boundary - 1] === '0021_family_menu_generations.sql');
for (const name of migrations) assert.deepEqual(readFileSync(resolve(candidate, 'migrations', name)), readFileSync(resolve(source, 'migrations', name)), `Artifact/source migration mismatch: ${name}`);
const previousMigrations = migrations.slice(0, boundary);
const now = Math.floor(Date.now() / 1000), date = '2026-10-12', familyId = 'rollout-family';
const secret = 'local-only-synthetic-rollout-secret';
const quoted = value => `'${String(value).replaceAll("'", "''")}'`;
const checks = [], observed = { candidateSha: manifest.sourceSha, root, checks, requests: 0, environment: 'local Wrangler 4.149.0 / workerd / D1; dummy identities only', productionDrain: 'not simulated' };
const record = (name, details = {}) => { checks.push({ name, ...details }); writeFileSync(resolve(root, 'result.json'), JSON.stringify(observed, null, 2)); };
const menu = { weekStart: date, prefs: { includeIds: ['rollout-owner'], cookingMode: 'all_meals', currency: 'KZT' },
  days: Array.from({ length: 7 }, (_, index) => ({ day: `Synthetic day ${index + 1}`,
    ...Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snack'].map(slot => [slot,
      { base: 'Synthetic rice', portions: { 'rollout-owner': '400 g' } }])) })),
  shoppingList: ['Synthetic rice'], shoppingListItems: [{ name: 'Synthetic rice', grams: 400 }] };

function configureCase(name) {
  const directory = resolve(root, name); mkdirSync(directory);
  const migrationDirectory = resolve(directory, 'migrations'); mkdirSync(migrationDirectory);
  for (const name of previousMigrations) copyFileSync(resolve(source, 'migrations', name), resolve(migrationDirectory, name));
  const config = resolve(directory, 'wrangler.toml'), state = resolve(directory, 'state');
  writeFileSync(config, `name = "fitfocus-local-rollout-${name}"
pages_build_output_dir = ${JSON.stringify(resolve(candidate, 'dist').replaceAll('\\', '/'))}
compatibility_date = "2026-02-17"
compatibility_flags = ["nodejs_compat"]
[vars]
AUTH_JWT_SECRET = "${secret}"
REQUIRE_INVITE = "0"
[[d1_databases]]
binding = "DB"
database_name = "synthetic-rollout-${name}"
database_id = "${randomUUID()}"
migrations_dir = ${JSON.stringify(migrationDirectory.replaceAll('\\', '/'))}
`);
  const d1 = (args, options) => {
    assert(!args.includes('--remote'));
    return run(process.execPath, [cli, 'd1', ...args, '--local', '--config', config, '--persist-to', state], options);
  };
  const query = sql => {
    const result = JSON.parse(d1(['execute', 'DB', '--command', sql, '--json']));
    assert(result.every(item => item.success !== false), 'D1 query failed');
    return result.map(item => item.results);
  };
  // Let the real runner create and populate d1_migrations; do not forge its ledger.
  // Noninteractive input can approve only this generated --local dummy database.
  const apply = () => d1(['migrations', 'apply', 'DB'], { input: 'y\n' });
  const list = () => d1(['migrations', 'list', 'DB']);
  apply();
  assert.deepEqual(query('SELECT name FROM d1_migrations ORDER BY name;')[0].map(row => row.name), previousMigrations);
  record(`${name}: real runner initialized through 0021`, { appliedMigrations: previousMigrations.length });
  return { directory, config, state, migrationDirectory, d1, query, apply, list };
}

function seed(database, capacity) {
  const members = ['owner', 'member', ...Array.from({ length: Math.max(0, capacity - 2) }, (_, index) => `extra-${index}`)];
  const principals = [...members, 'creator', 'joiner'];
  let sql = '';
  for (const role of principals) {
    sql += `INSERT INTO users(id,name,created_at) VALUES('rollout-${role}','Synthetic ${role}',${now});
INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES('rollout-session-${role}','rollout-${role}',${now},${now + 3600});
INSERT INTO user_roles(user_id,role) VALUES('rollout-${role}','user');
INSERT INTO user_profiles(user_id,profile_json,updated_at,version) VALUES('rollout-${role}',${quoted(JSON.stringify({ id: `rollout-${role}`, name: `Synthetic ${role}` }))},${now * 1000},1);
`;
  }
  for (const role of ['owner', 'creator']) sql += `INSERT INTO subscriptions(user_id,plan,status,updated_at) VALUES('rollout-${role}','family','active',${now * 1000});\n`;
  sql += `INSERT INTO families(id,owner_user_id,name,created_at) VALUES('${familyId}','rollout-owner','Synthetic family',${now});\n`;
  for (const role of members) sql += `INSERT INTO family_members(id,family_id,user_id,role,status,created_at) VALUES('rollout-membership-${role}','${familyId}','rollout-${role}','${role === 'owner' ? 'owner' : 'member'}','active',${now});\n`;
  sql += `INSERT INTO family_invites(code,family_id,created_by_user_id,created_at,expires_at) VALUES('ROLLOUT-LOCAL','${familyId}','rollout-owner',${now},${now + 1800});
INSERT INTO family_menu_generations(family_id,week_start,version,menu_json,created_by_user_id,updated_at) VALUES('${familyId}','${date}',7,${quoted(JSON.stringify(menu))},'rollout-owner',${now * 1000});
`;
  const file = resolve(database.directory, 'seed.sql'); writeFileSync(file, sql);
  database.d1(['execute', 'DB', '--file', file]);
}

const planningProfile = { displayName: 'Synthetic owner', ageGroup: 'adult', portionShare: 1,
  allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [] };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function identity(role) {
  const sub = `rollout-${role}`, sid = `rollout-session-${role}`;
  const message = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, sid, exp: now + 3500 })}`;
  return { token: `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`, headers: {
    'X-FitFocus-State-Account': sub,
    'X-FitFocus-State-Session': createHash('sha256').update(JSON.stringify(['state-session-v1', sub, sid])).digest('hex'),
  } };
}
let child;
async function stop() {
  if (!child || child.exitCode !== null) { child = undefined; return; }
  const stopping = child; child = undefined;
  if (!stopping.pid) return;
  const exited = new Promise(resolve => stopping.once('exit', resolve));
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(stopping.pid), '/T', '/F'], { timeout: 10_000, stdio: 'ignore' });
  else { try { process.kill(-stopping.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  await Promise.race([exited, new Promise((_, reject) => {
    const timer = setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-stopping.pid, 'SIGKILL'); } catch {} reject(new Error('Local worker did not stop')); }, 10_000);
    exited.then(() => clearTimeout(timer));
  })]);
}
async function start(database) {
  const port = await new Promise((resolvePort, reject) => {
    const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => {
      const address = socket.address(); socket.close(() => resolvePort(address.port));
    });
  });
  const origin = `http://127.0.0.1:${port}`, log = resolve(database.directory, 'worker.log');
  child = spawn(process.execPath, [cli, 'pages', 'dev', resolve(candidate, 'dist'), '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', '0', '--persist-to', database.state],
  { cwd: database.directory, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => appendFileSync(log, bytes)); child.stderr.on('data', bytes => appendFileSync(log, bytes));
  child.once('error', error => appendFileSync(log, String(error)));
  const request = async (path, method = 'GET', body, role = 'owner') => {
    const user = identity(role);
    const response = await fetch(origin + path, { method, headers: { Cookie: `ff_session=${user.token}`,
      'Content-Type': 'application/json', ...user.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(3000) });
    observed.requests += 1;
    return { status: response.status, body: await response.json() };
  };
  const until = Math.min(deadline, Date.now() + 30_000);
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Local worker exited: ${readFileSync(log, 'utf8').slice(-2000)}`);
    try { if ((await request('/api/me')).body.user?.sub === 'rollout-owner') return request; } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Local worker startup failed; inspect ${log}`);
}

const stableRows = `SELECT * FROM users ORDER BY id;
SELECT * FROM user_profiles ORDER BY user_id;
SELECT * FROM families ORDER BY id;
SELECT * FROM family_members ORDER BY id;
SELECT * FROM family_invites ORDER BY code;
SELECT * FROM family_menu_generations ORDER BY family_id,week_start;
SELECT * FROM weekly_menus ORDER BY id;
SELECT * FROM weekly_menu_items ORDER BY id;
SELECT * FROM d1_migrations ORDER BY id;
SELECT * FROM sqlite_sequence ORDER BY name;`;
const stableSchema = "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name;";
const menuAndProfiles = 'SELECT family_id,week_start,version,menu_json,created_by_user_id,updated_at FROM family_menu_generations ORDER BY family_id,week_start; SELECT * FROM user_profiles ORDER BY user_id;';

try {
  const valid = configureCase('valid'); seed(valid, 2);
  const beforeDeniedWrites = valid.query(menuAndProfiles);
  let request = await start(valid);
  let result = await request('/api/me'); assert.equal(result.status, 200); assert.equal(result.body.familyPlanning, undefined);
  assert.equal(result.body.familyMenuSync?.cas, 1);
  result = await request(`/api/family/dining-profiles?familyId=${familyId}`); assert.equal(result.status, 503);
  result = await request(`/api/family/menu/generate?week=${date}`, 'POST', { preview: true, familyId, date, rosterVersion: 1,
    selections: [{ slot: 'lunch', participantShares: { 'rollout-owner': 1 } }] }); assert.equal(result.status, 503);
  result = await request('/api/family/dining-profile', 'PATCH', { familyId, profileId: 'rollout-owner', baseVersion: 1, baseRosterVersion: 1, profile: planningProfile });
  assert.equal(result.status, 503);
  result = await request('/api/family/menu/state', 'PUT', { familyId, weekStart: date, baseVersion: 7, mutationKind: 'planning',
    menu: { planningV1: { schemaVersion: 1, date } } }); assert.equal(result.status, 503);
  assert.deepEqual(valid.query(menuAndProfiles), beforeDeniedWrites);
  record('C on 0021: capability absent, roster/preview/profile writes fail closed without menu/profile effects');
  result = await request('/api/family', 'POST', { name: 'Synthetic newly created family' }, 'creator'); assert.equal(result.status, 201);
  const createdFamily = result.body.family.id;
  result = await request('/api/family/join', 'POST', { code: 'ROLLOUT-LOCAL' }, 'joiner'); assert.equal(result.status, 200); assert.equal(result.body.familyId, familyId);
  const [created, joined, claim] = valid.query(`SELECT count(*) n FROM families f JOIN family_members m ON m.family_id=f.id WHERE f.id=${quoted(createdFamily)} AND m.user_id='rollout-creator' AND m.status='active';
SELECT count(*) n FROM family_members WHERE family_id='${familyId}' AND user_id='rollout-joiner' AND status='active';
SELECT used_by_user_id FROM family_invites WHERE code='ROLLOUT-LOCAL';`);
  assert.equal(created[0].n, 1); assert.equal(joined[0].n, 1); assert.equal(claim[0].used_by_user_id, 'rollout-joiner');
  record('C atomic create/join work on 0021', { created: 1, joined: 1, inviteClaimedBy: 'synthetic joiner' });
  await stop();
  const beforeMigration = valid.query(menuAndProfiles);
  copyFileSync(resolve(source, 'migrations', migration), resolve(valid.migrationDirectory, migration));
  const pending = valid.list(); writeFileSync(resolve(valid.directory, 'pending-before.txt'), pending);
  assert.deepEqual([...new Set(pending.match(/\b\d{4}_[a-zA-Z0-9_-]+\.sql\b/g) ?? [])], [migration]);
  valid.apply();
  assert.deepEqual(valid.query('SELECT name FROM d1_migrations ORDER BY name;')[0].map(row => row.name), migrations);
  const [profiles, roster, columns] = valid.query(`SELECT id,profile_json,active FROM family_dining_profiles ORDER BY id;
SELECT id,dining_roster_version,planning_format_version FROM families ORDER BY id;
SELECT name FROM pragma_table_info('family_menu_generations') WHERE name='legacy_menu_json';`);
  assert.equal(profiles.length, 4); assert(profiles.every(profile => profile.profile_json === null && profile.active === 1));
  assert.equal(roster.find(family => family.id === familyId).dining_roster_version, 3);
  assert.equal(roster.find(family => family.id === createdFamily).dining_roster_version, 1);
  assert(roster.every(family => family.planning_format_version === 0)); assert.equal(columns.length, 1);
  assert.deepEqual(valid.query(menuAndProfiles), beforeMigration);
  request = await start(valid);
  result = await request('/api/me'); assert.equal(result.status, 200); assert.deepEqual(result.body.familyPlanning, { version: 1 });
  result = await request(`/api/family/dining-profiles?familyId=${familyId}`); assert.equal(result.status, 200); assert.equal(result.body.roster.profiles.length, 3);
  result = await request(`/api/family/menu/state?familyId=${familyId}&week=${date}`);
  assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 7); assert.deepEqual(result.body.snapshot.menu, menu);
  assert.deepEqual(valid.query(menuAndProfiles), beforeMigration);
  record('real migration apply 0022 enables readiness and seeds exact roster; existing menu/profile bytes and readers unchanged');
  await stop();

  const overflow = configureCase('capacity-six'); seed(overflow, 6);
  const beforeSchema = overflow.query(stableSchema), beforeRows = overflow.query(stableRows);
  writeFileSync(resolve(overflow.directory, 'before.json'), JSON.stringify({ schema: beforeSchema, rows: beforeRows }, null, 2));
  copyFileSync(resolve(source, 'migrations', migration), resolve(overflow.migrationDirectory, migration));
  const overflowPending = overflow.list(); writeFileSync(resolve(overflow.directory, 'pending-before.txt'), overflowPending);
  assert.deepEqual([...new Set(overflowPending.match(/\b\d{4}_[a-zA-Z0-9_-]+\.sql\b/g) ?? [])], [migration]);
  let failure;
  try { overflow.apply(); } catch (error) { failure = error; }
  assert(failure, 'Migration runner unexpectedly accepted a six-member family');
  const failureText = String(failure.stdout ?? '') + String(failure.stderr ?? '') + String(failure.message);
  writeFileSync(resolve(overflow.directory, 'apply-failed.txt'), failureText);
  const afterSchema = overflow.query(stableSchema), afterRows = overflow.query(stableRows);
  writeFileSync(resolve(overflow.directory, 'after.json'), JSON.stringify({ schema: afterSchema, rows: afterRows }, null, 2));
  const atomic = JSON.stringify(beforeSchema) === JSON.stringify(afterSchema) && JSON.stringify(beforeRows) === JSON.stringify(afterRows);
  record('capacity-six runner failure observed', { atomic, capacityFailureRecognized: /CHECK constraint failed|family_planning_capacity_check|n\s*<=\s*5/i.test(failureText), repairAttempted: false });
  assert(atomic, `0022 runner is NOT fully transactional: partial schema/rows/ledger changes remain in ${overflow.directory}; no repair/down migration attempted`);
  assert.match(failureText, /CHECK constraint failed|family_planning_capacity_check|n\s*<=\s*5/i, 'Migration failed for a reason other than expected capacity CHECK');
  assert.equal(overflow.query("SELECT count(*) n FROM sqlite_master WHERE name='family_dining_profiles' OR name='family_planning_capacity_check' OR name LIKE 'family_planning_%' OR name LIKE 'family_dining_%' OR name LIKE 'family_members_active_%' OR name LIKE 'family_members_dining_%' OR name='family_members_identity' OR name='family_roster_overflow';")[0][0].n, 0);
  assert.equal(overflow.query("SELECT count(*) n FROM pragma_table_info('families') WHERE name IN ('dining_roster_version','planning_format_version');")[0][0].n, 0);
  assert.equal(overflow.query("SELECT count(*) n FROM pragma_table_info('family_menu_generations') WHERE name='legacy_menu_json';")[0][0].n, 0);
  assert.equal(overflow.query(`SELECT count(*) n FROM d1_migrations WHERE name=${quoted(migration)};`)[0][0].n, 0);
  record('capacity-six: complete schema/data/menu bytes/ledger rollback verified; no auto repair');
  observed.ok = true;
  writeFileSync(resolve(root, 'result.json'), JSON.stringify(observed, null, 2));
  console.log(JSON.stringify(observed));
} catch (error) {
  observed.ok = false; observed.error = error instanceof Error ? error.message : String(error);
  writeFileSync(resolve(root, 'result.json'), JSON.stringify(observed, null, 2));
  console.error(JSON.stringify(observed)); process.exitCode = 1;
} finally { await stop(); }
