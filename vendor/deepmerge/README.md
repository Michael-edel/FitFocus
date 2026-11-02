# Local deepmerge security patch

This is the bundled CommonJS implementation and types from deepmerge 4.3.1
(MIT; see license.txt), with three destination writes changed to
`Object.defineProperty` using ordinary enumerable, configurable, writable data
properties. A JSON-owned `__proto__` key must never invoke the inherited setter
and replace the returned object's prototype. The normal result prototype and
the upstream array/custom merge/clone APIs are retained.

Upstream npm tarball: deepmerge-4.3.1.tgz, SHA-1
`44b5f2147cd3b00d4b56137685966f26fd25dd4a`.
Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4.
At the 2 November 2026 review there was no published patched upstream version.
The package version is explicitly marked `4.3.1+fitfocus.1` (local build metadata).
A direct local development dependency installs it at the `deepmerge` lookup
path and satisfies Rollup's existing semver range. This is a source patch, not
an advisory suppression or a claim that the
upstream 4.3.1 release is fixed. tests/deepmerge_security.test.ts exercises the
installed consumer dependency, both poisoned paths and compatibility behavior.

Replace this local package with an upstream fix when available, after rerunning
the security regression and build/PWA/rollback checks. Preserve the strict audit.
