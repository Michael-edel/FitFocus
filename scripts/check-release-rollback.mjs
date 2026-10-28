import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { buildReleaseArtifact, verifyReleaseArtifact, assertRollbackCompatibility } from './release-artifact.mjs';

const run = promisify(execFile), project = process.cwd(), supplied = resolve(process.argv[2] ?? '');
const args = process.argv.slice(3), values = new Map();
for (let index = 0; index < args.length; index += 2) {
  assert(['--candidate', '--retained-source'].includes(args[index]) && args[index + 1], 'Expected --candidate <artifact> and/or --retained-source <immutable SHA>');
  assert(!values.has(args[index]), 'Duplicate release check argument'); values.set(args[index], args[index + 1]);
}
const expectedManifest = verifyReleaseArtifact(supplied);
const structured = expectedManifest.compatibility.d1Migration === '0022_family_planning.sql';
const retainedSource = values.get('--retained-source') ?? (structured ? '' : '98d49101e15ad652e1960381ce00e00e8dac0d44');
assert.match(retainedSource, /^[a-f0-9]{40}$/, '0022 requires the separately reviewed immutable bridge SHA via --retained-source');
assert.equal(expectedManifest.sourceSha, retainedSource);
const require = createRequire(import.meta.url), cli = resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const root = mkdtempSync(resolve(tmpdir(), 'fitfocus-rollback-http-')), state = resolve(root, 'state');
const artifact = resolve(root, 'retained'); mkdirSync(artifact);
execFileSync('tar', ['-xf', supplied + '.tar', '-C', artifact], { stdio: 'inherit' });
const manifest = verifyReleaseArtifact(artifact); assert.deepEqual(manifest, expectedManifest);
const config = resolve(root, 'wrangler.toml'), log = resolve(root, 'worker.log');
const candidate = values.has('--candidate') ? resolve(values.get('--candidate')) : resolve(root, 'current');
const current = resolve(candidate, 'dist');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
if (!values.has('--candidate')) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
  buildReleaseArtifact({ sourceSha: head, output: candidate });
}
const candidateManifest = verifyReleaseArtifact(candidate), candidateSha = candidateManifest.sourceSha;
assertRollbackCompatibility(candidateManifest, expectedManifest);
for (const migration of ['0021_family_menu_generations.sql', ...(structured ? ['0022_family_planning.sql'] : [])]) {
  assert.equal(readFileSync(resolve(candidate, 'migrations', migration), 'utf8'), readFileSync(resolve(artifact, 'migrations', migration), 'utf8'),
    'Candidate and bridge must share the exact reviewed migrations');
}
let planningDomain, ingredientCatalog;
const clientSource = resolve(root, 'candidate-source'); mkdirSync(clientSource);
execFileSync('tar', ['-xf', resolve(candidate, 'source.tar'), '-C', clientSource], { stdio: 'inherit' });
if (structured) {
  // Use the current client's exact retained domain serializer/projection, never handwritten derived legacy fields.
  const domainBundle = resolve(root, 'current-client-domain.mjs'), catalogBundle = resolve(root, 'current-client-catalog.mjs');
  for (const [entry, outfile] of [['familyPlanning.ts', domainBundle], ['familyPlanningCatalog.ts', catalogBundle]]) {
    require('esbuild').buildSync({ entryPoints: [resolve(clientSource, 'domain', entry)], outfile, bundle: true, platform: 'node', format: 'esm' });
  }
  planningDomain = await import(pathToFileURL(domainBundle).href);
  ingredientCatalog = (await import(pathToFileURL(catalogBundle).href)).FAMILY_INGREDIENTS;
}
const databaseId = randomUUID(), secret = 'local-only-retained-release', week = '2026-10-12', familyId = 'rollback-family';
const configure = directory => writeFileSync(config, `name = "fitfocus-rollback-local"
pages_build_output_dir = ${JSON.stringify(directory.replaceAll('\\', '/'))}
compatibility_date = "2026-02-17"
compatibility_flags = ["nodejs_compat"]
[vars]
AUTH_JWT_SECRET = "${secret}"
REQUIRE_INVITE = "0"
[[d1_databases]]
binding = "DB"
database_name = "rollback-local-only"
database_id = "${databaseId}"
`);
configure(current);
const menu = grams => ({ weekStart: week, prefs: { includeIds: ['rollback-owner'], cookingMode: 'all_meals', currency: 'KZT' },
  days: Array.from({ length: 7 }, (_, index) => ({ day: String(index), ...Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snack'].map(meal =>
    [meal, { base: 'Рис', portions: { 'rollback-owner': `${grams} г, 560 ккал` } }])) })),
  shoppingList: ['Рис'], shoppingListItems: [{ name: 'Рис', grams }] });
const quoted = value => `'${String(value).replaceAll("'", "''")}'`, now = Math.floor(Date.now() / 1000);
const schema = readFileSync(resolve(clientSource, 'db/schema.sql'), 'utf8');
const boundary = schema.indexOf('-- 0021_family_menu_generations.sql'); assert(boundary > 0);
let seed = schema.slice(0, boundary);
for (const role of ['owner', 'member']) seed += `
INSERT INTO users(id,name,created_at) VALUES('rollback-${role}','Synthetic ${role}',${now});
INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES('rollback-session-${role}','rollback-${role}',${now},${now + 7200});
INSERT INTO user_roles(user_id,role) VALUES('rollback-${role}','user');
`;
seed += `
INSERT INTO subscriptions(user_id,plan,status,updated_at) VALUES('rollback-owner','family','active',${now * 1000});
INSERT INTO families(id,owner_user_id,name,created_at) VALUES('${familyId}','rollback-owner','Synthetic rollback family',${now});
INSERT INTO family_members(id,family_id,user_id,role,status,created_at) VALUES('rollback-owner-member','${familyId}','rollback-owner','owner','active',${now});
INSERT INTO family_members(id,family_id,user_id,role,status,created_at) VALUES('rollback-member-member','${familyId}','rollback-member','member','active',${now});
INSERT INTO weekly_menus(id,family_id,week_start,menu_json,created_by_user_id,created_at) VALUES('rollback-old-menu','${familyId}','${week}',${quoted(JSON.stringify(menu(400)))},'rollback-owner',${now});
INSERT INTO weekly_menu_items(id,user_id,family_id,week_start,ingredient_name,grams,created_at) VALUES('rollback-old-family','rollback-owner','${familyId}','${week}','Legacy family',999,${now});
INSERT INTO weekly_menu_items(id,user_id,family_id,week_start,ingredient_name,grams,created_at) VALUES('rollback-old-personal','rollback-owner',NULL,'${week}','Legacy personal',333,${now});
`;
seed += readFileSync(resolve(artifact, 'migrations/0021_family_menu_generations.sql'), 'utf8');
if (structured) seed += readFileSync(resolve(candidate, 'migrations/0022_family_planning.sql'), 'utf8');
writeFileSync(resolve(root, 'seed.sql'), seed);
execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config, '--persist-to', state,
  '--file', resolve(root, 'seed.sql')], { cwd: root, env, stdio: 'inherit' });
const port = await new Promise((accept, reject) => {
  const socket = createServer(); socket.on('error', reject); socket.listen(0, '127.0.0.1', () => {
    const address = socket.address(); socket.close(() => accept(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`, encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function identity(role) {
  const sub = `rollback-${role}`, sid = `rollback-session-${role}`;
  const message = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, sid, exp: now + 3600 })}`;
  return { token: `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`, scope: {
    'X-FitFocus-State-Account': sub, 'X-FitFocus-State-Session': createHash('sha256').update(JSON.stringify(['state-session-v1', sub, sid])).digest('hex'),
  } };
}
const owner = identity('owner'), member = identity('member'); let child, requests = 0;
async function request(path, method = 'GET', body, user = owner) {
  const response = await fetch(origin + path, { method, headers: { Cookie: `ff_session=${user.token}`,
    'Content-Type': 'application/json', ...user.scope }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
  requests += 1; return { status: response.status, body: await response.json(), headers: response.headers };
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') await run('taskkill', ['/PID', String(child.pid), '/T', '/F']);
  else process.kill(-child.pid, 'SIGTERM');
  await stopped; child = undefined;
}
async function start(directory) {
  configure(directory);
  child = spawn(process.execPath, [cli, 'pages', 'dev', directory, '--port', String(port), '--inspector-port', '0', '--persist-to', state],
    { cwd: root, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => appendFileSync(log, data)); child.stderr.on('data', data => appendFileSync(log, data));
  const until = Date.now() + 40_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Local worker exited: ${readFileSync(log, 'utf8').slice(-2000)}`);
    try { const result = await request('/api/me'); if (result.status === 200 && result.body.user?.sub === 'rollback-owner') return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Local worker did not become ready: ${log}`);
}
const profile = (grams, baseVersion) => ({ id: 'rollback-owner', name: 'Synthetic rollback profile', baseVersion,
  aiPlan: { weeklyMenu: { weekStart: week, days: [], shoppingList: [], shoppingListItems: grams ? [{ name: 'Personal canonical', grams }] : [] } } });
const familyPath = `/api/family/menu/state?familyId=${familyId}&week=${week}`;
const familyWrite = (grams, baseVersion) => ({ familyId, weekStart: week, baseVersion, menu: menu(grams) });
try {
  await start(current);
  let result = await request('/api/me'); assert.equal(result.body.familyMenuSync.cas, 1); assert.equal(result.body.profileSync.weeklyMenuProjection, 1);
  result = await request('/api/profile', 'PUT', profile(700, 0)); assert.equal(result.status, 200); assert.equal(result.body.version, 1);
  result = await request(familyPath); assert.equal(result.body.snapshot.version, 1);
  result = await request('/api/family/menu/state', 'PUT', familyWrite(700, 1)); assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 2);
  await stop();
  // New process loads the actual retained worker without changing its bytes or database.
  await start(resolve(artifact, 'dist'));
  result = await request('/api/profile'); assert.equal(result.body.profile.version, 1); assert.equal(result.body.profile.aiPlan.weeklyMenu.shoppingListItems[0].grams, 700);
  result = await request(`/api/shopping/list?week=${week}`); assert.equal(result.body.items[0].grams, 700);
  result = await request(familyPath, 'GET', undefined, member); assert.equal(result.body.snapshot.version, 2); assert.equal(result.body.snapshot.menu.shoppingListItems[0].grams, 700);
  result = await request(`/api/shopping/list?week=${week}&family_id=${familyId}`, 'GET', undefined, member); assert.equal(result.body.items[0].grams, 700);
  result = await request('/api/family/menu/state', 'PUT', familyWrite(900, 1)); assert.equal(result.status, 409); assert.equal(result.body.snapshot.version, 2);
  result = await request('/api/family/menu/state', 'PUT', familyWrite(900, 2), member); assert.equal(result.status, 403);
  result = await request('/api/family/menu/state', 'PUT', familyWrite(900, 2), { ...owner, scope: { ...owner.scope, 'X-FitFocus-State-Session': '0'.repeat(64) } }); assert.equal(result.status, 401);
  result = await request('/api/family/menu', 'POST', familyWrite(900, 2)); assert.equal(result.status, 409);
  result = await request('/api/weekly_menu/items', 'POST', { family_id: familyId, week_start: week, items: [] }); assert.equal(result.status, 409);
  result = await request('/api/family/menu/state', 'PUT', familyWrite(800, 2)); assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 3);
  result = await request('/api/profile', 'PUT', profile(800, 1)); assert.equal(result.status, 200); assert.equal(result.body.version, 2);
  result = await request(`/api/shopping/list?week=${week}&family_id=${familyId}`); assert.equal(result.body.items[0].grams, 800);
  result = await request(`/api/shopping/list?week=${week}`); assert.equal(result.body.items[0].grams, 800);
  const empty = familyWrite(800, 3); empty.menu.days = []; empty.menu.shoppingList = []; empty.menu.shoppingListItems = [];
  result = await request('/api/family/menu/state', 'PUT', empty); assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 4);
  result = await request('/api/profile', 'PUT', profile(0, 2)); assert.equal(result.status, 200); assert.equal(result.body.version, 3);
  result = await request(`/api/shopping/list?week=${week}&family_id=${familyId}`); assert.deepEqual(result.body.items, []);
  result = await request(`/api/shopping/list?week=${week}`); assert.deepEqual(result.body.items, []);
  if (structured) {
    await stop(); await start(current);
    result = await request('/api/me'); assert.equal(result.body.familyPlanning.version, 1);
    result = await request(`/api/family/dining-profiles?familyId=${familyId}`); assert.equal(result.status, 200);
    const self = result.body.roster.profiles.find(profile => profile.id === 'rollback-owner'); assert(self);
    result = await request('/api/family/dining-profile', 'PATCH', { familyId, profileId: self.id, baseVersion: self.version,
      baseRosterVersion: result.body.roster.rosterVersion, profile: { displayName: 'Synthetic owner', ageGroup: 'adult', portionShare: 1,
        allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [] } });
    assert.equal(result.status, 200); const rosterVersion = result.body.rosterVersion;
    result = await request(`/api/family/menu/generate?week=${week}`, 'POST', { preview: true, familyId, date: week, rosterVersion,
      selections: [{ slot: 'lunch', recipeId: 'chicken-rice-v1', participantShares: { 'rollback-owner': 1 } }] });
    assert.equal(result.status, 200); assert.equal(result.body.preview, true);
    const day = structuredClone(result.body.shared.menu.planningV1);
    day.manualItems.push({ id: 'manual:rollback', name: 'Synthetic pieces', quantity: 3, unit: 'piece', purchasedQuantity: 1 });
    const canonical = planningDomain.deriveLegacyFamilyMenu(day);
    const writeDay = (menu, baseVersion, mutationKind = 'planning') => ({ familyId, weekStart: week, baseVersion, mutationKind, menu });
    result = await request('/api/family/menu/state', 'PUT', writeDay(canonical, 4));
    assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 5); assert.deepEqual(result.body.snapshot.menu, canonical);
    await stop(); await start(resolve(artifact, 'dist'));
    result = await request('/api/me'); assert.equal(result.body.familyPlanning.version, 1);
    result = await request(familyPath, 'GET', undefined, member);
    assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 5); assert.deepEqual(result.body.snapshot.menu, canonical);
    result = await request(`/api/family/menu/archive?familyId=${familyId}`, 'GET', undefined, member);
    assert.equal(result.status, 200); assert(result.body.items.some(item => item.periodStart === week && item.kind === 'legacy-weekly' && item.menu.days.length === 0));
    result = await request(`/api/shopping/list?week=${week}&family_id=${familyId}`, 'GET', undefined, member); assert.equal(result.status, 409);
    result = await request('/api/family/menu/state', 'PUT', familyWrite(950, 5)); assert.equal(result.status, 409);
    result = await request('/api/family/menu/state', 'PUT', writeDay(canonical, 4)); assert.equal(result.status, 409); assert.equal(result.body.snapshot.version, 5);
    result = await request('/api/family/menu/state', 'PUT', writeDay(canonical, 5), member); assert.equal(result.status, 403);
    result = await request('/api/family/menu/state', 'PUT', writeDay(canonical, 5), { ...owner, scope: { ...owner.scope, 'X-FitFocus-State-Session': '0'.repeat(64) } }); assert.equal(result.status, 401);
    const bought = structuredClone(day); bought.purchasedQuantities.find(item => item.ingredientId === 'rice').quantity = 250;
    bought.manualItems[0].purchasedQuantity = 2;
    const purchasedMenu = planningDomain.deriveLegacyFamilyMenu(bought);
    result = await request('/api/family/menu/state', 'PUT', writeDay(purchasedMenu, 5, 'purchases'), member);
    assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 6); assert.deepEqual(result.body.snapshot.menu, purchasedMenu);
    const projection = planningDomain.projectFamilyDay(result.body.snapshot.menu.planningV1, ingredientCatalog);
    assert.equal(projection.items.find(item => item.ingredientId === 'rice').purchasedQuantity, 250);
    assert.equal(projection.items.find(item => item.ingredientId === 'rice').toBuy, 0);
    assert.equal(projection.manualItems[0].toBuy, 1); assert.equal(projection.manualItems[0].unit, 'piece');
    const changed = structuredClone(bought); changed.meals[0].participantShares['rollback-owner'] = 1.25;
    const replanned = planningDomain.deriveLegacyFamilyMenu(changed);
    result = await request('/api/family/menu/state', 'PUT', writeDay(replanned, 6, 'purchases'), member); assert.equal(result.status, 403);
    result = await request('/api/family/menu/state', 'PUT', writeDay(replanned, 6));
    assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 7); assert.deepEqual(result.body.snapshot.menu, replanned);
    // Return to the candidate on the same D1: the bridge's writes must remain readable and writable.
    await stop(); await start(current);
    result = await request(familyPath); assert.equal(result.status, 200); assert.deepEqual(result.body.snapshot.menu, replanned);
    result = await request('/api/family/menu/state', 'PUT', writeDay(replanned, 7)); assert.equal(result.status, 200); assert.equal(result.body.snapshot.version, 8);
    await stop(); await start(resolve(artifact, 'dist'));
    result = await request(`/api/family/dining-profiles?familyId=${familyId}`); assert.equal(result.status, 200);
    result = await request('/api/family/dining-profiles', 'POST', { familyId, baseRosterVersion: result.body.roster.rosterVersion,
      profile: { displayName: 'Synthetic managed cleanup', ageGroup: 'child', portionShare: 0.75,
        allergies: { state: 'none', allergenIds: [] }, hardExcludedIngredientIds: [], dislikedIngredientIds: [] } });
    assert.equal(result.status, 201);
    result = await request('/api/account/delete', 'POST', { confirm: 'DELETE' }, member); assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  }
  await stop();
  const sql = 'SELECT ingredient_name, grams FROM weekly_menu_items ORDER BY grams;';
  const retained = JSON.parse(execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config,
    '--persist-to', state, '--command', sql, '--json'], { cwd: root, env, encoding: 'utf8' }));
  assert.deepEqual(retained[0].results.map(row => row.grams), [333, 999]);
  if (structured) {
    const remaining = JSON.parse(execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config,
      '--persist-to', state, '--command', "SELECT count(*) AS n FROM family_dining_profiles WHERE user_id='rollback-member';", '--json'], { cwd: root, env, encoding: 'utf8' }));
    assert.equal(remaining[0].results[0].n, 0, 'Retained worker must clean up 0022 private dining data on account deletion');
    // Only this isolated synthetic family is deactivated, to exercise the existing owner-deletion precondition.
    execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config, '--persist-to', state,
      '--command', `UPDATE families SET is_active=0 WHERE id='${familyId}';`], { cwd: root, env, stdio: 'inherit' });
    await start(resolve(artifact, 'dist'));
    result = await request('/api/account/delete', 'POST', { confirm: 'DELETE' }); assert.equal(result.status, 200); assert.equal(result.body.ok, true);
    await stop();
    const cleanup = JSON.parse(execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config,
      '--persist-to', state, '--command', `SELECT (SELECT count(*) FROM family_dining_profiles WHERE family_id='${familyId}') AS profiles,
      (SELECT count(*) FROM family_menu_generations WHERE family_id='${familyId}') AS generations;`, '--json'], { cwd: root, env, encoding: 'utf8' }));
    assert.deepEqual(cleanup[0].results[0], { profiles: 0, generations: 0 }, 'Bridge owner cleanup must remove managed private profiles and archived canonical menus');
  }
  verifyReleaseArtifact(candidate);
  verifyReleaseArtifact(artifact);
  console.log(JSON.stringify({ ok: true, requests, candidateSha, sourceSha: manifest.sourceSha, origin, log, environment: 'local Pages worker/workerd/D1, two synthetic accounts, same database',
    checks: ['current accepted generations', 'retained canonical profile/family readers', 'personal and family projection',
      'CAS after server rollback', 'session and owner guards', 'legacy writer refusal', 'empty canonical without legacy fallback', 'legacy retained',
      ...(structured ? ['0022 canonical structured reader/archive', 'current-client serializer and quantities', 'member purchase CAS', 'owner planning CAS',
        '0022 format downgrade refusal', 'forward reader/CAS after bridge writes', '0022 member and owner/managed private-data cleanup'] : [])] }));
} finally { await stop(); }
