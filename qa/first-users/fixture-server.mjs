// Local QA transport only. Never deployed or imported by the application.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, stat, mkdir, appendFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = resolve(import.meta.dirname, '../..');
const stage = process.argv.includes('--baseline-regression') ? 'baseline-regression' : process.argv.includes('--regression') ? 'regression' : process.argv.includes('--retest') ? 'retest' : 'baseline';
const dist = stage.startsWith('baseline') ? resolve(import.meta.dirname, 'baseline-dist') : resolve(root, 'dist');
const stateRoot = resolve(import.meta.dirname, 'state');
const sha = '5ee93b0ea05faa5a3cf827ee80e6d51cdc017946';
await mkdir(stateRoot, { recursive: true });
const ports = process.argv.includes('--preflight') ? [4250] : stage === 'baseline' ? [4251, 4252, 4253, 4254] : stage === 'retest' ? [4261, 4262, 4263, 4264] : stage === 'baseline-regression' ? [4280] : [4270,4271];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const aiPlan = { title: 'Персональный план', strategySummary: 'Регулярное питание и посильная активность.', weeklyFocus: 'Стабильный режим', dailyKpi: { calories: 1800, protein: 120, fat: 60, carbs: 195 }, rules: ['Регулярные приёмы пищи', 'Следить за водой'], firstTasks: ['Записать первый завтрак', 'Открыть план'], mealTemplate: { breakfast: 'Овсянка 250 г', lunch: 'Курица и рис', dinner: 'Рыба и овощи', snack: 'Йогурт' }, createdAt: '2026-10-22T00:00:00.000Z', model: 'local-qa-fixture' };

for (const port of ports) {
  const account = `qa-first-user-${port}`, cookieName = `ff_qa_${port}`;
  const expectedEmail = `first-user-${port}@example.test`;
  const databasePath = stage.includes('regression') ? ':memory:' : resolve(stateRoot, `${stage}-${port}.sqlite`);
  const db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE IF NOT EXISTS qa_user (id TEXT PRIMARY KEY,email TEXT NOT NULL,session TEXT NOT NULL); CREATE TABLE IF NOT EXISTS qa_profile (id TEXT PRIMARY KEY,json TEXT NOT NULL,version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS qa_kv (k TEXT PRIMARY KEY,v TEXT NOT NULL,version INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);');
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== `127.0.0.1:${port}` || req.socket.remoteAddress !== '127.0.0.1') { res.writeHead(403); res.end('Loopback only'); return; }
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const origin = req.headers.origin;
      if (origin && origin !== url.origin) { res.writeHead(403); res.end('Cross-origin denied'); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-FitFocus-QA', 'local-fixture');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; form-action 'self'; base-uri 'self'; object-src 'none'");
      const path = url.pathname, method = req.method;
      const cookie = (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      const row = db.prepare('SELECT * FROM qa_user WHERE id=?').get(account);
      const user = row && cookie === row.session ? row : null;
      const headers = { 'Content-Type': 'application/json', 'X-FitFocus-State-Account': account, 'X-FitFocus-State-Session': user?.session ?? '', ...Object.fromEntries(['State','Profile','Bootstrap','AI','Weekly-Menu','Achievements','Huawei','Push','Family','Family-Menu','Billing','Support'].flatMap(r => [[`X-FitFocus-${r}-Protocol`, r === 'State' ? '2' : '1'], [`X-FitFocus-${r}-Guard`, '1']])) };
      const json = (body, status = 200) => { res.writeHead(status, headers); res.end(JSON.stringify(body)); };
      const profileRow = () => db.prepare('SELECT * FROM qa_profile WHERE id=?').get(account);
      const profile = () => { const p = profileRow(); return p ? { ...JSON.parse(p.json), version: p.version } : null; };
      const stateItems = (prefix = `fitfocus_data_${account}_`, includeDeleted = false) => db.prepare(`SELECT * FROM qa_kv WHERE substr(k,1,length(?))=?${includeDeleted ? '' : ' AND deleted=0'}`).all(prefix,prefix).map(r => ({ key:r.k,value:r.v,version:r.version,exists:r.deleted===0 }));
      if (path === '/__qa/health') return json({ fixture: true, host: '127.0.0.1', port, stage, baselineSha: sha, buildRevision: process.env.QA_REVISION ?? sha, email: expectedEmail, database: stage.includes('regression') ? ':memory:' : `${stage}-${port}.sqlite`, productionBindings: false, outboundHttp: false, paymentProvider: 'disabled-no-test-credentials', ai: 'deterministic-fixture' });
      if (path === '/api/auth/google/start') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Локальный тестовый вход</title><h1>Локальный тестовый вход</h1><p>Это fixture, Google и отправка писем не используются.</p><form action="/__qa/login" method="post"><label>Тестовый email <input name="email" type="email" value="${expectedEmail}" required></label><button>Продолжить тестовый вход</button></form></html>`); return;
      }
      let raw = ''; for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 1_000_000) { json({ error: 'QA_BODY_LIMIT' }, 413); return; } }
      if (path === '/__qa/login' && method === 'POST') {
        if (new URLSearchParams(raw).get('email') !== expectedEmail) return json({ error: 'ONLY_ASSIGNED_TEST_EMAIL' }, 400);
        const session = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO qa_user VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET session=excluded.session').run(account, expectedEmail, session);
        res.writeHead(302, { Location: '/?auth=google', 'Set-Cookie': `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/` }); res.end(); return;
      }
      if (path === '/api/env') return json({ requireInvite: false });
      if (path === '/api/me') {
        if (!user) return json({ user: null, hasAccess: true });
        const capabilities = Object.fromEntries(['bootstrap','profile','ai','weeklyMenu','achievement','huawei','push','family','billing','support'].map(r => [r+'Sync', { protocol: 1, guard: 1, ...(r === 'profile' ? { weeklyMenuProjection: 1 } : {}), ...(r === 'family' ? { target: 1 } : {}) }]));
        return json({ user: { sub: account, email: expectedEmail, name: 'Тестовый пользователь', roles: ['user'] }, hasAccess: true, stateSync: { protocol: 2, guard: 1, accountId: account, sessionId: user.session }, ...capabilities, familyMenuSync: { protocol: 1, guard: 1, cas: 1 } });
      }
      if (path.startsWith('/api/')) {
        if (!user) return json({ error: 'UNAUTH' }, 401);
        if (method !== 'GET' && path !== '/api/logout' && (req.headers['x-fitfocus-state-account'] !== account || req.headers['x-fitfocus-state-session'] !== user.session)) return json({ error: 'INVALID_SCOPE' }, 403);
        let body = {}; if (raw) { try { body = JSON.parse(raw); } catch { return json({ error: 'BAD_JSON' }, 400); } }
        if (path === '/api/bootstrap') return json({ user: { sub: account, email: expectedEmail }, profile: profile(), items: stateItems() });
        if (path === '/api/profile') {
          if (method === 'PUT') {
            const current = profileRow(); const version = current?.version ?? 0;
            if (body.baseVersion !== version) return json({ error: 'PROFILE_CONFLICT', version, profile: profile() }, 409);
            const next = { ...body, id: account, googleSub: account, email: expectedEmail, version: version + 1 }; delete next.baseVersion;
            db.prepare('INSERT INTO qa_profile VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,version=excluded.version').run(account, JSON.stringify(next), next.version);
          }
          return json({ profile: profile(), version: profileRow()?.version ?? 0 });
        }
        if (path === '/api/state') {
          if (method === 'GET') return json({ items: stateItems(url.searchParams.get('prefix') ?? '',url.searchParams.get('includeDeleted')==='1') });
          if (method !== 'PUT' && method !== 'DELETE') return json({error:'METHOD_NOT_ALLOWED'},405);
          if (req.headers['x-fitfocus-state-protocol'] !== '2') return json({ error: 'STATE_PROTOCOL_REQUIRED' }, 426);
          const items = method === 'DELETE' ? [{ key:url.searchParams.get('key'),baseVersion:Number(url.searchParams.get('baseVersion')) }] : body.items;
          if (!Array.isArray(items) || items.length > 32 || items.some(i => typeof i.key !== 'string' || !i.key.startsWith(`fitfocus_data_${account}_`))) return json({ error: 'QA_INVALID_ITEMS' }, 400);
          const conflict = items.find(i => (db.prepare('SELECT version FROM qa_kv WHERE k=?').get(i.key)?.version ?? 0) !== i.baseVersion);
          if (conflict) return json({ error:'KV_CONFLICT',key:conflict.key,version:db.prepare('SELECT version FROM qa_kv WHERE k=?').get(conflict.key)?.version ?? 0 },409);
          db.exec('BEGIN'); try { for (const i of items) db.prepare('INSERT INTO qa_kv VALUES (?,?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,version=excluded.version,deleted=excluded.deleted').run(i.key, method === 'DELETE' ? '' : String(i.value),i.baseVersion+1,method === 'DELETE' ? 1 : 0); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
          const acknowledged = items.map(i=>({key:i.key,version:i.baseVersion+1,exists:method!=='DELETE'})); return json(method === 'DELETE' ? {ok:true,...acknowledged[0]} : {ok:true,items:acknowledged});
        }
        if (path === '/api/ai' && body.feature === 'personal_plan') return json({ text: JSON.stringify(aiPlan) });
        if (path === '/api/ai' && body.feature === 'wis_text') return json({ text:'Регулярное питание и посильная активность.' });
        if (path === '/api/family') return json({ family:null,members:[] });
        if (path === '/api/achievements' || path === '/api/achievements/check') return json({ enabled:true,catalog:[],unlocked:[],newlyUnlocked:[] });
        if (path === '/api/wearable/huawei/status') return json({configured:false,connected:false});
        if (path === '/api/push/status') return json({configured:false,current_subscription_id:null,count:0,subscriptions:[]});
        if (path === '/api/billing/checkout') return json({error:'QA_STRIPE_SANDBOX_NOT_CONFIGURED'},503);
        if (path === '/api/logout') { res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); return json({ok:true}); }
        await appendFile(resolve(stateRoot,'unsupported-api.log'),`${port} ${method} ${path}\n`);
        return json({error:'QA_UNIMPLEMENTED_API',path},501);
      }
      const target = resolve(dist, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
      if (!target.startsWith(dist + sep)) { res.writeHead(403); res.end(); return; }
      try { if (!(await stat(target)).isFile()) throw new Error('not file'); res.setHeader('Content-Type',mime[extname(target)] ?? 'application/octet-stream'); res.setHeader('Service-Worker-Allowed','/'); res.end(await readFile(target)); }
      catch { res.writeHead(404); res.end('Not found'); }
    } catch { if (!res.headersSent) res.writeHead(500); res.end('QA fixture failure'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`QA ${stage} ${port}: http://127.0.0.1:${port} (${expectedEmail})`));
}
