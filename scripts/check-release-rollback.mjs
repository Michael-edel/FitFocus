import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildReleaseArtifact, verifyReleaseArtifact } from './release-artifact.mjs';

const run = promisify(execFile), project = process.cwd(), supplied = resolve(process.argv[2] ?? '');
const expectedManifest = verifyReleaseArtifact(supplied);
assert.equal(expectedManifest.sourceSha, '98d49101e15ad652e1960381ce00e00e8dac0d44');
const require = createRequire(import.meta.url), cli = resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const root = mkdtempSync(resolve(tmpdir(), 'fitfocus-rollback-http-')), state = resolve(root, 'state');
const artifact = resolve(root, 'retained'); mkdirSync(artifact);
execFileSync('tar', ['-xf', supplied + '.tar', '-C', artifact], { stdio: 'inherit' });
const manifest = verifyReleaseArtifact(artifact); assert.deepEqual(manifest, expectedManifest);
const config = resolve(root, 'wrangler.toml'), log = resolve(root, 'worker.log');
const current = resolve(root, 'current/dist');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
buildReleaseArtifact({ sourceSha: candidateSha, output: resolve(root, 'current') });
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
const schema = readFileSync(resolve(project, 'db/schema.sql'), 'utf8');
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
  await stop();
  const sql = 'SELECT ingredient_name, grams FROM weekly_menu_items ORDER BY grams;';
  const retained = JSON.parse(execFileSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--config', config,
    '--persist-to', state, '--command', sql, '--json'], { cwd: root, env, encoding: 'utf8' }));
  assert.deepEqual(retained[0].results.map(row => row.grams), [333, 999]);
  verifyReleaseArtifact(artifact);
  console.log(JSON.stringify({ ok: true, requests, candidateSha, sourceSha: manifest.sourceSha, origin, log, environment: 'local Pages worker/workerd/D1, two synthetic accounts, same database',
    checks: ['current accepted generations', 'retained canonical profile/family readers', 'personal and family projection',
      'CAS after server rollback', 'session and owner guards', 'legacy writer refusal', 'empty canonical without legacy fallback', 'legacy retained'] }));
} finally { await stop(); }
