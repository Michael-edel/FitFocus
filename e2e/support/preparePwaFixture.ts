import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

export const previousPwaCommit = '3baac01c98bd82ab7a87c0e9c2999914db194590';
// Source paths containing node_modules change this project's manualChunks classification.
export const previousPwaRoot = resolve(tmpdir(), 'fitfocus-pwa-fixtures',
  createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12), 'v2-3ba');
export const previousPwaDist = resolve(previousPwaRoot, 'dist');

/** Build an actual published client once, before browser workers start. */
export default function preparePwaFixture() {
  const project = process.cwd();
  const git = (args: string[]) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
  try { git(['cat-file', '-e', `${previousPwaCommit}:package-lock.json`]); }
  catch { git(['fetch', 'origin', previousPwaCommit, '--depth=1']); }
  const expectedLock = git(['show', `${previousPwaCommit}:package-lock.json`]);
  const lockHash = createHash('sha256').update(expectedLock).digest('hex');
  const marker = resolve(previousPwaRoot, 'fixture-build.json');
  if (existsSync(marker) && existsSync(resolve(previousPwaDist, 'sw.js'))) {
    const prepared = JSON.parse(readFileSync(marker, 'utf8'));
    if (prepared.commit === previousPwaCommit && prepared.lockHash === lockHash) return;
    throw new Error('PWA fixture cache identity changed; use a new cache directory');
  }
  mkdirSync(previousPwaRoot, { recursive: true });
  const archive = resolve(previousPwaRoot, 'source.tar');
  git(['archive', '--format=tar', `--output=${archive}`, previousPwaCommit]);
  execFileSync('tar', ['-xf', archive, '-C', previousPwaRoot], { stdio: 'inherit' });
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(previousPwaRoot),
    GITHUB_SHA: previousPwaCommit, GITHUB_REF_NAME: 'pwa-fixture-v2-3ba' };
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run browser checks through npm so the fixture uses the configured Node runtime');
  const currentLock = readFileSync(resolve(project, 'package-lock.json'), 'utf8').trim();
  if (currentLock === expectedLock) {
    if (!existsSync(resolve(previousPwaRoot, 'node_modules'))) symlinkSync(resolve(project, 'node_modules'), resolve(previousPwaRoot, 'node_modules'), 'junction');
  } else {
    execFileSync(process.execPath, [npm, 'ci'], { cwd: previousPwaRoot, env, stdio: 'inherit' });
  }
  execFileSync(process.execPath, [npm, 'run', 'build'], { cwd: previousPwaRoot, env, stdio: 'inherit' });
  writeFileSync(marker, JSON.stringify({ commit: previousPwaCommit, lockHash }));
}
