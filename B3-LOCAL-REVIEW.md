# B3 prefix adapter — local acceptance and release limits

Based on exact B2 `a6b2048bb94b4550013662b18c778f88b785798d`, including its
DOMPurify 3.4.17 patch and canonical readers. This draft changes only create/join
business plans and adds a shared prefix adapter plus its unit contract.

The adapter recognizes either complete absence of reserved prefix objects or the
exact reviewed optional deferred-FK schema. Present base/non-FK, partial, changed,
disabled or unknown-revision schemas fail closed. Control singleton/revision/enabled
is admission state, **not an installation receipt**. No guessed migration/ledger
name, runtime filesystem SQL, installation DDL or cleanup is added to the app.

Handlers retain their original session/response guards, prechecks and canonical
accepted/latest readers. Exactly one `db.batch` executes either strengthened
business/business/table-free consistency assertion, or reviewed token/business/
business/assert/delete. A failed batch is propagated, never retried as bare or
split SQL. An installer racing the absence read must reject and roll back the
entire bare batch, including membership inserted before a guarded invite claim.

The table-free assertion uses SQLite's documented lazy CASE and integer overflow
from `abs(-9223372036854775808)`; its success/noop/adversarial/rollback behavior
has passed actual local D1 acceptance. Unit tests cover metadata and plan
admission separately; they are not SQL transaction evidence.

Independent Sol source and fixture reviews found no P1/P2 blockers. Exact B3
`b8babb13200a95827b7495769a15151bb4c1c7de` passed 1680 unit tests across232 files,
all three typechecks, guards, schema/privacy and frontend/PWA/Pages builds in
`ff-check-e854da2c2e90`. Its app bytes equal frozen implementation `c98951e`.
The compiled use cases passed52 local workerd/D1 cases: create/join before/after
0022, exact full-row outcomes, no-op/IGNORE rollback, metadata failure and installer
TOCTOU. Four further managed-capacity cases passed in
`ff-prefix-managed-capacity-6e385b75ad48`: owner+three managed accepts the fifth
account; owner+four managed rejects the sixth with full rollback. Both bare/token
plans, token0 and durable reopen were verified. These are compiled Node use cases
with real local D1, not public HTTP/session or Cloud D1 proof.

Integration into the current Family candidate and its exact B3 rollback artifacts
requires a separate combined check. A dedicated atomic installer and installation
receipt remain **unimplemented** and separately reviewed/authorized requirements.
No production install, deploy or working-database change is authorized here.

The existing differential local-D1 evidence for the optional FK prototype does
not retag the earlier error-string diagnostic FAIL or establish cloud D1 behavior.
Account deletion, identity transfer, invitations and other lifecycle writers are
outside these two prefix guards: this is not a global family hold or HTTP drain.
