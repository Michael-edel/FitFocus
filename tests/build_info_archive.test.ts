import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps generated build history usable by TypeScript outside a Git checkout', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fitfocus-build-info-test-'));
  try {
    execFileSync(process.execPath, [resolve('scripts/generate-build-info.mjs')], {
      cwd: directory,
      env: { PATH: process.env.PATH, GIT_CEILING_DIRECTORIES: tmpdir(), GITHUB_SHA: 'a'.repeat(40) },
    });
    const generated = readFileSync(join(directory, 'build-info.generated.ts'), 'utf8');
    expect(generated).toContain('"recentBuilds": []');
    const consumer = join(directory, 'consumer.ts');
    writeFileSync(consumer, `import { BUILD_SOURCE } from './build-info.generated';
      BUILD_SOURCE.recentBuilds.map(build => build.sha + build.shortSha + build.committedAt + build.subject);
      const firstSha: string = BUILD_SOURCE.recentBuilds[0].sha;`);
    const program = ts.createProgram([consumer], {
      noEmit: true, strict: true, skipLibCheck: true, types: [],
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    expect(ts.getPreEmitDiagnostics(program).map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n'))).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
