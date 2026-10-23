import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReleaseArtifact, verifyReleaseArtifact } from '../../scripts/release-artifact.mjs';

export const previousPwaCommit = '3baac01c98bd82ab7a87c0e9c2999914db194590';
// Source paths containing node_modules change this project's manualChunks classification.
export const previousPwaRoot = resolve(tmpdir(), 'fitfocus-pwa-fixtures',
  createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12), 'v2-3ba');
export const previousPwaDist = resolve(previousPwaRoot, 'dist');
export const legacyWriterPwaCommit = '22a77889f131b554f52519515efc7ac811f6169f';
export const legacyWriterPwaRoot = resolve(tmpdir(), 'fitfocus-pwa-fixtures',
  createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12), 'legacy-writer-22a');
export const legacyWriterPwaDist = resolve(legacyWriterPwaRoot, 'dist');
// Distinct 0022-compatible baseline; acceptance still requires the native and HTTP gates.
export const rollbackPwaCommit = '246a2d70b70671f20081d0ba985279127c0e0262';
export const rollbackPwaRoot = process.env.FITFOCUS_ROLLBACK_ARTIFACT ?? resolve(tmpdir(), 'fitfocus-pwa-fixtures',
  createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12), 'rollback-246a2d7');
export const rollbackPwaDist = resolve(rollbackPwaRoot, 'dist');

/** Build a pinned source release once, before browser workers start. */
function prepareSourcePwaFixture(commit: string, root: string) {
  const project = process.cwd();
  const git = (args: string[]) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
  try { git(['cat-file', '-e', `${commit}:package-lock.json`]); }
  catch { git(['fetch', 'origin', commit, '--depth=1']); }
  const expectedLock = git(['show', `${commit}:package-lock.json`]);
  const lockHash = createHash('sha256').update(expectedLock).digest('hex');
  const dist = resolve(root, 'dist');
  const marker = resolve(root, 'fixture-build.json');
  if (existsSync(marker) && existsSync(resolve(dist, 'sw.js'))) {
    const prepared = JSON.parse(readFileSync(marker, 'utf8'));
    if (prepared.commit === commit && prepared.lockHash === lockHash) return;
    throw new Error('PWA fixture cache identity changed; use a new cache directory');
  }
  mkdirSync(root, { recursive: true });
  const archive = resolve(root, 'source.tar');
  git(['archive', '--format=tar', `--output=${archive}`, commit]);
  execFileSync('tar', ['-xf', archive, '-C', root], { stdio: 'inherit' });
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(root),
    GITHUB_SHA: commit, GITHUB_REF_NAME: `pwa-fixture-${commit.slice(0, 7)}` };
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run browser checks through npm so the fixture uses the configured Node runtime');
  const currentLock = readFileSync(resolve(project, 'package-lock.json'), 'utf8').trim();
  if (currentLock === expectedLock) {
    if (!existsSync(resolve(root, 'node_modules'))) symlinkSync(resolve(project, 'node_modules'), resolve(root, 'node_modules'), 'junction');
  } else {
    execFileSync(process.execPath, [npm, 'ci'], { cwd: root, env, stdio: 'inherit' });
  }
  execFileSync(process.execPath, [npm, 'run', 'build'], { cwd: root, env, stdio: 'inherit' });
  writeFileSync(marker, JSON.stringify({ commit, lockHash }));
}

export default function preparePwaFixture() {
  prepareSourcePwaFixture(previousPwaCommit, previousPwaRoot);
  prepareSourcePwaFixture(legacyWriterPwaCommit, legacyWriterPwaRoot);
  if (existsSync(resolve(rollbackPwaRoot, 'release.json'))) {
    if (verifyReleaseArtifact(rollbackPwaRoot).sourceSha !== rollbackPwaCommit) throw new Error('Unexpected rollback source');
    return;
  }
  try { execFileSync('git', ['cat-file', '-e', `${rollbackPwaCommit}^{commit}`], { stdio: 'pipe' }); }
  catch { execFileSync('git', ['fetch', 'origin', rollbackPwaCommit, '--depth=1'], { stdio: 'inherit' }); }
  buildReleaseArtifact({ sourceSha: rollbackPwaCommit, output: rollbackPwaRoot });
}
