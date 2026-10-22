import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const required = ['dist/index.html', 'dist/sw.js', 'dist/_routes.json', 'dist/_worker.js/index.js',
  'source.tar', 'package-lock.json', 'wrangler.toml', 'migrations/0021_family_menu_generations.sql'];

function inventory(root, directory = root) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = resolve(directory, name), info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`Release contains a symlink: ${relative(root, path)}`);
    if (info.isDirectory()) return inventory(root, path);
    if (!info.isFile()) throw new Error(`Release contains a non-file: ${relative(root, path)}`);
    const file = relative(root, path).split(sep).join('/');
    return file === 'release.json' ? [] : [{ path: file, bytes: info.size, sha256: sha256(readFileSync(path)) }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}

/** Hashes detect damaged/mixed files; source review and runtime tests establish compatibility. */
export function verifyReleaseArtifact(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'release.json'), 'utf8'));
  if (manifest.format !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceSha)
    || manifest.compatibility?.idbVersion !== 3
    || manifest.compatibility?.d1Migration !== '0021_family_menu_generations.sql') {
    throw new Error('Unsupported release identity or storage contract');
  }
  const files = inventory(root);
  for (const file of required) if (!files.some(entry => entry.path === file)) throw new Error(`Missing release file: ${file}`);
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Release file inventory or SHA-256 mismatch');
  return manifest;
}

export function buildReleaseArtifact({ sourceSha, output, project = process.cwd(), wranglerCli = undefined }) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Provide a full, immutable Git commit SHA');
  project = realpathSync(project);
  output = resolve(output);
  if (existsSync(output) || existsSync(output + '.tar')) throw new Error('Release output already exists; choose a new directory');
  const ancestor = path => existsSync(path) ? realpathSync(path) : resolve(ancestor(dirname(path)), path.slice(dirname(path).length + 1));
  const target = relative(project, ancestor(output));
  if (!target || (!target.startsWith('..' + sep) && target !== '..' && !isAbsolute(target))) {
    throw new Error('Keep release artifacts outside the source checkout');
  }
  const git = args => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
  git(['cat-file', '-e', `${sourceSha}^{commit}`]);
  const source = file => git(['show', `${sourceSha}:${file}`]);
  if (!/STATE_DATABASE_VERSION\s*=\s*3\s*;/.test(source('storage/stateDatabase.ts'))
    || !/DB_MIGRATION_VERSION\s*=\s*"0021_family_menu_generations.sql"/.test(source('versioning.ts'))) {
    throw new Error('This packager only supports the reviewed IDB v3 / D1 0021 contract');
  }
  const require = createRequire(resolve(project, 'package.json'));
  wranglerCli ??= resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
  const wranglerVersion = execFileSync(process.execPath, [wranglerCli, '--version'], { encoding: 'utf8' }).trim();
  if (wranglerVersion !== '4.149.0') throw new Error('Use the pinned Wrangler 4.149.0 toolchain');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run through npm so the configured Node/npm toolchain is preserved');
  mkdirSync(output, { recursive: true });
  const buildRoot = mkdtempSync(resolve(tmpdir(), 'fitfocus-release-'));
  const archive = resolve(output, 'source.tar');
  git(['archive', '--format=tar', `--output=${archive}`, sourceSha]);
  execFileSync('tar', ['-xf', archive, '-C', buildRoot], { stdio: 'inherit' });
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(buildRoot),
    GITHUB_SHA: sourceSha, GITHUB_REF_NAME: 'retained-release', WRANGLER_SEND_METRICS: 'false' };
  const lock = readFileSync(resolve(buildRoot, 'package-lock.json'), 'utf8');
  if (lock.trim() === readFileSync(resolve(project, 'package-lock.json'), 'utf8').trim()) {
    symlinkSync(resolve(project, 'node_modules'), resolve(buildRoot, 'node_modules'), 'junction');
  } else {
    execFileSync(process.execPath, [npm, 'ci'], { cwd: buildRoot, env, stdio: 'inherit' });
  }
  execFileSync(process.execPath, [npm, 'run', 'build'], { cwd: buildRoot, env, stdio: 'inherit' });
  cpSync(resolve(buildRoot, 'dist'), resolve(output, 'dist'), { recursive: true, errorOnExist: true, force: false });
  execFileSync(process.execPath, [wranglerCli, 'pages', 'functions', 'build', 'functions',
    '--outdir', resolve(output, 'dist/_worker.js'), '--compatibility-date', '2026-02-17',
    '--compatibility-flags', 'nodejs_compat'], { cwd: buildRoot, env, stdio: 'inherit' });
  for (const file of ['package-lock.json', 'wrangler.toml', 'migrations']) {
    cpSync(resolve(buildRoot, file), resolve(output, file), { recursive: true, errorOnExist: true, force: false });
  }
  const manifest = { format: 1, sourceSha, builtAt: new Date().toISOString(),
    toolchain: { node: process.version, wrangler: wranglerVersion },
    compatibility: { idbVersion: 3, d1Migration: '0021_family_menu_generations.sql',
      date: '2026-02-17', flags: ['nodejs_compat'] }, files: inventory(output) };
  writeFileSync(resolve(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  verifyReleaseArtifact(output);
  execFileSync('tar', ['-cf', output + '.tar', '-C', output, '.'], { stdio: 'inherit' });
  console.log(`Retained release ${sourceSha}: ${output}.tar`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === '--verify') {
      const manifest = verifyReleaseArtifact(resolve(args[1]));
      console.log(`Verified ${manifest.sourceSha}: ${manifest.files.length} files`);
    } else {
      if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--output') {
        throw new Error('Usage: npm run release:build -- --source <40-char SHA> --output <new external directory>');
      }
      buildReleaseArtifact({ sourceSha: args[1], output: args[3] });
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
