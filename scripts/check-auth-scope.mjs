import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const auth = read('functions/api/_lib/auth.ts');
if (!auth.includes('if (!options.allowMobileToken && aud === "mobile") throw new Error("UNAUTH");')) {
  fail('requireUser must reject mobile audience tokens by default.');
}
if (!auth.includes('requireMobileToken && aud !== "mobile"')) {
  fail('requireMobileUser must require aud="mobile".');
}

const wearableSync = read('functions/api/wearable/sync.ts');
if (!wearableSync.includes('requireMobileUser')) {
  fail('/api/wearable/sync must use requireMobileUser.');
}
if (wearableSync.includes('requireUser(request, env)')) {
  fail('/api/wearable/sync must not use generic requireUser.');
}

const apiDir = path.join(root, 'functions', 'api');
const offenders = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const rel = path.relative(root, full).replaceAll(path.sep, '/');
    if (rel === 'functions/api/_lib/auth.ts' || rel === 'functions/api/wearable/sync.ts') continue;
    const text = fs.readFileSync(full, 'utf8');
    if (text.includes('requireMobileUser')) offenders.push(rel);
  }
}
walk(apiDir);
if (offenders.length) {
  fail(`requireMobileUser is only allowed in /api/wearable/sync. Offenders: ${offenders.join(', ')}`);
}

if (process.exitCode) process.exit();
console.log('Auth scope check passed.');
