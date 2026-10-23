# Local B3 draft — not deploy ready

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
still requires actual local D1 acceptance. Unit tests only cover metadata and plan
admission; they are not SQL transaction evidence.

Remaining gates: independent source review, sandbox unit/type/guard checks, actual
compiled-handler D1 proof before and after 0022, installer TOCTOU, managed capacity,
and exact artifact pin. A dedicated atomic installer and honest installation
receipt remain **unimplemented** and separately reviewed/authorized requirements.
No production install, deploy or working-database change is authorized here.

The existing differential local-D1 evidence for the optional FK prototype does
not retag the earlier error-string diagnostic FAIL or establish cloud D1 behavior.
Account deletion, identity transfer, invitations and other lifecycle writers are
outside these two prefix guards: this is not a global family hold or HTTP drain.
