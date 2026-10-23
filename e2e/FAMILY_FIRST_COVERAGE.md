# Family-first browser coverage migration

## Acceptance snapshot, 23 October 2026 19:22 UTC+5

C25 `f5f3d635f0cd827eb245131bcb733d9071578e83` / B3 `b8babb1` full archives
passed50 local HTTP requests and12 requests /7 real-Wrangler rollout groups.
Native WebKit on this exact pair passed rollback2/2 and fresh installation1/1,
workers1/retries0, unchanged assertions/timeouts, Git-blob before/after and
stoppedPID0 parent acceptance. An earlier fresh-install target is retained as
an infrastructure failure after parent stdin loss; exit0 alone was not accepted.
C23 menu19/session12/callbacks37 passed68/68; C20 native update3/3 and Android
AI71passed/3platform skips apply to those revisions. C25 changes create/join
backend and rollback source pins, not the client runtime last changed at f272639.
Mobile engineering C20 now passed37/37 after fixing only an external async
polling predicate. These technical checks do not add independent user roles or
physical iOS/VoiceOver/3G acceptance. Full exact-head Family CI remains required.

The source-edit inventory below is historical; its "not executed" statements
describe the time of each edit, not this acceptance snapshot.

## Source-edit inventory

23 October 2026. Source changes only; no browser or Node run was performed on the host.

`family-menu-durable.spec.ts` keeps the original durability, conflict, recovery,
quota, held response, account switch, same-account session, pagehide/pageshow,
and unchanged-persistence assertions. The former family AI action in the personal
plan no longer exists. Its held-response probes now target the structured server
day preview. Explicit confirmation is required before a planning CAS write; a
purchase then uses another family-menu CAS write. The obsolete family AI and
separate shopping writers remain rejection traps in the fixture.

The former personal-profile edit during family AI is replaced by an edit of the
family day selections during a held preview. This covers the active causal input;
it does not claim to test the removed coupling from a personal profile to family
planning. The former family-preferences modal case now verifies per-meal member
participation and explicit owner-only draft recovery.

The generic personal navigation helper opens More when its actual destination
is hidden, on desktop as well as phone. Personal deep-link routes are retained.
Negative capability fixtures must continue to omit the capability being tested.

`family-session.spec.ts` retains all twelve scenarios with structured roster/day
fixtures, actual private-profile forms and purchase CAS. Every family request
asserts its originating account/session and explicit family target; the removed
member/weekly/shopping writers are rejection traps and every scenario checks
that none were used. Held logout/invitation callbacks, same-account session
replacement, navigation abort signals and fresh BFCache context/menu reads remain
required. BFCache must issue new HTTP reads; polling unchanged local state is
insufficient.

Three former automatic Monday-rollover scenarios now assert the exact selected
day contract. Advancing the wall clock cannot change the selected date or retarget
a held context/snapshot/purchase. After the held operation finishes, an explicit
date change must load a separate projection with no transferred purchase marks.
This is not evidence for the removed automatic-week reload behavior. The former
legacy member-goal action is now a dining private-profile PATCH: invitation still
requires `familySync.target`, while its replacement profile path separately tests
missing `familyPlanning`. A refused shopping CAS preserves durable local intent
and the checkbox, requires an authentication-pause message, proves the accepted
server quantities remain unchanged, and retains the pending operation. This
replaces the removed transient-checkbox rollback semantics; reverting or dropping
the durable intent would be incorrect. Source edited only; these twelve cases
still require sandbox/browser execution and do not establish native SW acceptance.

Open migration boundaries at this source edit:

- `family-callback-account-switch.spec.ts` retains all 35 original cases and adds
  two held-preview identity cases. Family reads/profile edits/purchases now use
  day/private-profile/CAS. The obsolete transient-checkbox rollback expectation
  is replaced by durable intent through 503, retry and reload; personal/support/
  token/push/billing assertions remain. Browser execution is still pending.
- `pwaApiFixture.ts` now has an opt-in structured-day mode; its default legacy
  behavior and retained v2 `/family/menu` payload are unchanged. `pwa-update.spec.ts`
  ports only the current side of the pinned v2-to-v3 test and adds a current-only
  native SW/HTTP/IDB preview-confirm-retry-reload-purchase test. These edits have
  not been executed.
- Structured rollback tests now target independently pinned prefix-aware B3:
  `b8babb13200a95827b7495769a15151bb4c1c7de`, tree
  `f1e221c0bfec4857a4658b34d0f3c0416d1f83f5`. B3 retains the B2 draft/cache
  compatibility and DOMPurify 3.4.17 changes and adds the single-batch prefix-aware
  create/join adapter. This pin is currently local; it has not been published.
  Earlier pair/browser results for B2 `a6b2048` remain historical B2 evidence and
  do not establish B3 acceptance. The separate frozen-source C25/B3 checks are
  recorded in the current acceptance snapshot above.
  This source edit makes no production-readiness claim. The former 98d artifact
  remains historical and must not be described as 0022 compatible.
- `pwa-rollback.spec.ts` keeps pending/conflicted payload/opId/remote snapshot,
  retry timing, two-tab explicit SW activation, profile, IDB store/ledger/quarantine
  and auth-fence assertions and adds the return C -> B -> C. A real UI empty
  selection draft and a separately seeded valid recovery envelope must survive
  both activations without an implicit preview or another logical mutation.
- `pwa-rollback-install.spec.ts` installs B fresh, keeps interrupted sender/retry
  opId/value and actual SW update assertions, then delivers and purchases through
  structured CAS. B is protocol-2 aware, so this scenario strictly expects zero
  state-protocol rejections; the original protocol-426 legacy-writer boundary
  remains in the separate pinned v2 forward/import scenarios. No acceptance of
  the old unguarded writer is implied.
- Firefox availability and the complete browser matrix are unverified here.

No tests were deleted, no skip was added, and no CI gate was relaxed by this edit.
