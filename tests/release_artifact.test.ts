import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildReleaseArtifact, verifyReleaseArtifact, releaseStorageContract, assertRollbackCompatibility } from '../scripts/release-artifact.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (dirname(realpathSync(root)) !== realpathSync(tmpdir()) || !root.includes('fitfocus-artifact-')) throw new Error('Unsafe fixture cleanup');
  rmSync(root, { recursive: true, force: true });
} });

function fixture(migration = '0021_family_menu_generations.sql') {
  const root = mkdtempSync(resolve(tmpdir(), 'fitfocus-artifact-test-')); roots.push(root);
  const paths = ['dist/index.html', 'dist/sw.js', 'dist/_routes.json', 'dist/_worker.js/index.js',
    'source.tar', 'package-lock.json', 'wrangler.toml', 'migrations/0021_family_menu_generations.sql'];
  if (migration === '0022_family_planning.sql') paths.push('migrations/0022_family_planning.sql');
  const files = paths.sort((a, b) => a.localeCompare(b)).map(path => {
    const bytes = Buffer.from(`fixture: ${path}`);
    mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), bytes);
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const manifest = { format: migration === '0022_family_planning.sql' ? 2 : 1, sourceSha: 'a'.repeat(40),
    compatibility: releaseStorageContract(migration), files };
  writeFileSync(resolve(root, 'release.json'), JSON.stringify(manifest));
  return { root, manifest };
}

describe('retained release integrity', () => {
  it('refuses 0021 rollback for 0022 and refuses a candidate masquerading as its own bridge', () => {
    const legacy = { sourceSha: 'a'.repeat(40), compatibility: releaseStorageContract('0021_family_menu_generations.sql') };
    const current = { sourceSha: 'b'.repeat(40), compatibility: releaseStorageContract('0022_family_planning.sql') };
    expect(() => assertRollbackCompatibility(current, legacy)).toThrow('0021 worker');
    expect(() => assertRollbackCompatibility(current, current)).toThrow('distinct reviewed commits');
    expect(() => assertRollbackCompatibility(current, { ...current, sourceSha: 'c'.repeat(40) })).not.toThrow();
  });
  it('verifies the explicit 0022 format, archive, purchase CAS and cleanup contract', () => {
    const { root, manifest } = fixture('0022_family_planning.sql');
    expect(verifyReleaseArtifact(root)).toEqual(manifest);
    expect(manifest.format).toBe(2);
    expect(manifest.compatibility.familyPlanning).toEqual({ schemaVersion: 1, formatMarker: 1,
      archiveColumn: 'legacy_menu_json', purchaseCas: 1, accountCleanup: 'family_dining_profiles' });
  });
  it('rejects a 0022 claim with missing contract fields or its migration, even with an edited inventory', () => {
    const { root, manifest } = fixture('0022_family_planning.sql');
    delete manifest.compatibility.familyPlanning.purchaseCas;
    writeFileSync(resolve(root, 'release.json'), JSON.stringify(manifest));
    expect(() => verifyReleaseArtifact(root)).toThrow('storage contract');
    manifest.compatibility = releaseStorageContract('0022_family_planning.sql');
    rmSync(resolve(root, 'migrations/0022_family_planning.sql'));
    manifest.files = manifest.files.filter(file => file.path !== 'migrations/0022_family_planning.sql');
    writeFileSync(resolve(root, 'release.json'), JSON.stringify(manifest));
    expect(() => verifyReleaseArtifact(root)).toThrow('Missing release file: migrations/0022');
  });
  it('does not reinterpret historical manifests or unknown future schemas as structured-compatible', () => {
    const { root, manifest } = fixture();
    manifest.compatibility.d1Migration = '0022_family_planning.sql';
    writeFileSync(resolve(root, 'release.json'), JSON.stringify(manifest));
    expect(() => verifyReleaseArtifact(root)).toThrow('storage contract');
    expect(() => releaseStorageContract('0023_unknown.sql')).toThrow('storage contract');
  });
  it('verifies the entire inventory, including the compiled worker', () => {
    const { root, manifest } = fixture(); expect(verifyReleaseArtifact(root)).toEqual(manifest);
    writeFileSync(resolve(root, 'dist/_worker.js/index.js'), 'mixed worker');
    expect(() => verifyReleaseArtifact(root)).toThrow('SHA-256 mismatch');
  });
  it('rejects an extra file that could otherwise be deployed', () => {
    const { root } = fixture(); writeFileSync(resolve(root, 'dist/extra.js'), 'unexpected');
    expect(() => verifyReleaseArtifact(root)).toThrow('inventory');
  });
  it('rejects missing critical files even if someone also edits the inventory', () => {
    const { root, manifest } = fixture(); rmSync(resolve(root, 'dist/sw.js'));
    manifest.files = manifest.files.filter(file => file.path !== 'dist/sw.js');
    writeFileSync(resolve(root, 'release.json'), JSON.stringify(manifest));
    expect(() => verifyReleaseArtifact(root)).toThrow('Missing release file');
  });
  it('does not follow a junction to files outside the retained artifact', () => {
    const { root } = fixture(); const target = mkdtempSync(resolve(tmpdir(), 'fitfocus-artifact-link-')); roots.push(target);
    symlinkSync(target, resolve(root, 'dist/linked'), 'junction');
    expect(() => verifyReleaseArtifact(root)).toThrow('symlink');
    // Remove only the known junction, before the generic fixture cleanup.
    rmSync(resolve(root, 'dist/linked'));
  });
  it('rejects storage downgrade metadata', () => {
    const { root, manifest } = fixture(); manifest.compatibility.idbVersion = 2;
    writeFileSync(resolve(root, 'release.json'), JSON.stringify(manifest));
    expect(() => verifyReleaseArtifact(root)).toThrow('storage contract');
  });
  it('refuses mutable references and an output inside the source checkout', () => {
    expect(() => buildReleaseArtifact({ sourceSha: 'HEAD', output: '/unused' })).toThrow('immutable Git');
    expect(() => buildReleaseArtifact({ sourceSha: 'a'.repeat(40), output: resolve('uncreated-release-output') }))
      .toThrow('outside the source checkout');
  });
});
