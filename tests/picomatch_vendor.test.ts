import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const picomatch: (pattern: string, options?: { maxExtglobRecursion?: false }) => (path: string) => boolean =
  require('picomatch');

describe('FitFocus local Picomatch', () => {
  it.each(['vite', 'vitest', 'tinyglobby', '@rollup/pluginutils'])('uses the local copy from %s', name => {
    const dependency = createRequire(require.resolve(name));
    const local = fileURLToPath(new URL('../vendor/picomatch/index.js', import.meta.url));
    expect(realpathSync(dependency.resolve('picomatch'))).toBe(realpathSync(local));
  });

  it('preserves path globs, nonrepeating groups and fixed-width repetitions', () => {
    expect(picomatch('**/*.ts')('src/index.ts')).toBe(true);
    expect(picomatch('src/@(app|routes).ts')('src/routes.ts')).toBe(true);
    expect(picomatch('part-+(ab|cd).txt')('part-abcdab.txt')).toBe(true);
    expect(picomatch('part-+(ab|cd).txt')('part-abc.txt')).toBe(false);
  });

  it.each([undefined, false as const])('treats a repeated wildcard group as literal with recursion opt-out %s', option => {
    const match = picomatch('reports-+(draft-*)/index.json', { maxExtglobRecursion: option });
    expect(match('reports-+(draft-*)/index.json')).toBe(true);
    expect(match('reports-draft-first/index.json')).toBe(false);
  });
});
