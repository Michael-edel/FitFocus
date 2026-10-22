# FitFocus: second correction pass, 22 October 2026

Code revision: `7716774ac1ba7ee13c77bad93eb56f755b11ec00` on
`qa/first-users-20261022`, parent `272e7ef335af37af8028728bd827cae6cb5437ea`.
This separate report commit does not change runtime or tests. Publication has
not occurred; remote exact-head CI remains required.
The eight original persona reports are historical and unchanged.

## Confirmed causes and changes

- Registration accepted target 999 kg for LOSS from 80 kg. Shared validation now requires finite 25–350 kg and a target consistent with LOSS/GAIN. Invalid input remains visible with an accessible explanation; validation runs before profile/AI writes. Existing risk acknowledgements remain required.
- The registration action overlapped the final goal on 375 px. The action now follows the form in normal document flow.
- First profile Save could observe revision 1/base 0 before registration ACK advanced confirmed base to 1. An atomic profile-only check permits rebasing only the exact observed, unchanged, acknowledged value with no queued intent; other CAS/session/editor guards remain intact. A real StateEditor regression failed against the previous storage implementation and passed with the change.
- Double Save had two causes: the cloud path lacked a synchronous submission gate, and a later successful profile publication could reread the old dirty localStorage form. Diagnostic Firefox trace proved: submit revision 1, success clears dirty, same-scope restore reads cached dirty=true, restore increments revision, second click submits revision 2. Both writes originate from the Save handler. The diagnostic run reproduced this twice in ten attempts. Temporary diagnostics are excluded from the release.

## Checks so far

Before the final cache-restoration correction: 1602 unit tests / 225 files, three TypeScript checks, schema/privacy/auth/API/admin guards, audit zero vulnerabilities. A 21-case matrix across seven browser profiles passed, but an additional Firefox repeat exposed the remaining cache race. That initial green matrix does not establish completion.

After the cache correction: 1608/1608 unit tests in 226 files; all three
TypeScript configurations; schema/privacy/auth/API/admin guards; audit zero.
Firefox strict double-Save repeat: 10/10, no retries. Independent source review:
no findings. The final seven-profile matrix passed 28/28 with zero retries, including
a restored dirty-cache variant, clean-cache persistence before ACK, exact one
operation/PUT, reload, target validation, 375 px geometry and logout/relogin.
Code SHA: `7716774ac1ba7ee13c77bad93eb56f755b11ec00`.
The final report commit is the remote CI candidate; its SHA is recorded by the
PR/check run. Full remote CI is pending.

## Separate CI dependency

PR97 head `8ae1195b06a104c5b862bb03d93851d6851be517`:
https://github.com/Michael-edel/FitFocus/actions/runs/39725978415
Terminal failure: 1506 unit passed; browser 1636 passed / 71 skipped / 1 failed.
The iPhone Safari logout test assumed pending although a retry was already sending 18 ms before logout. The retained operation and stopped sender were correct. A test-only deterministic held-request regression now verifies the late old-session response and fresh-session reclaim; it passed all seven browser profiles locally. Rollback/CAS steps in that old run were skipped. No old green result is attributed to the new changes.

## Publication prerequisites

Production DB is handled only by the parent-coordinated browser executor. This task does not write D1, restore data, or use another route. Actual binding is fitfocus-dev, ID 061ae786-9341-4bd7-8efe-025dd1bac6d5. Manual deleted_at ALTER already succeeded; journal0019 and migrations0020/0021 require confirmed execution/postchecks. Current browser access is blocked. Publication also requires a new exact-head full CI and normal PR protections.

Prices, terms and privacy findings remain report-only. No new persona round or production payment is performed.

Historical observations of a long mobile form, large top gap and dense navigation remain in the first audit; this pass addresses the explicitly requested target, Save and overlap defects. There is no new blind persona round and no claim that all historical UX observations disappeared.

Evidence: 35 actual Playwright PNGs retained locally under ignored `qa/first-users/artifacts/second-pass-final`; they are separate from the historical CUA image outputs, which have no exported screenshot files. Raw traces contain synthetic diagnostics and stay local.

## Remote CI on report head 9c3a200: terminal failure, 08:09 UTC

[CI39738443471](https://github.com/Michael-edel/FitFocus/actions/runs/39738443471)
checked head `9c3a2009ecb6b645506a55020c6f2e5c5cce0146`, actual checkout merge
`f9108e0b34709e99eb67fca4fb40f1e5c69ce164` into main
`5ee93b0ea05faa5a3cf827ee80e6d51cdc017946`.

- Audit zero; unit1608/226files; guards, all three typechecks and build passed.
- Browser1652passed /71skipped /6failed, retries0,57.4minutes.
- All six failures were the existing quota-failure Save case: the broad
  `getByRole('alert').filter({hasText:'Не удалось сохранить'})` matched both the
  storage warning and the new specific Save error. Assertions about the dirty
  draft and absence of writes after that locator were not reached.
- Rollback/CAS and rollback artifact were skipped, not passed.
- Retained browser artifact12411660768, SHA256
  `c8b82f1150f596a93bce2239f884e4cf777e5b0c148fd0863388979a1dea75ab`.

The follow-up changes only that test: require BOTH distinct alerts separately,
then retain every dirty/value/empty-outbox/no-HTTP/reload/error assertion.
No `.first()`, retries, timeout changes, runtime edits or reduced checks.
Independent review: no findings. Three TypeScript checks passed.
Seven-profile targeted matrix expanded to35cases: 35/35 passed, zero retries,
5.6minutes. The formerly failing quota case passed on all seven profiles and
executed every retained negative-write/draft assertion.
A fresh exact-head full CI remains required after the ordinary follow-up push.
