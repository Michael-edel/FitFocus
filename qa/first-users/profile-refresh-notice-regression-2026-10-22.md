# Profile refresh notice regression — 2026-10-22

## Failed CI evidence

- PR: https://github.com/Michael-edel/FitFocus/pull/98
- Head: `8964f134c8edf8a67a852f68049c388e487b51bb`.
- CI: https://github.com/Michael-edel/FitFocus/actions/runs/39746942675 — completed, failure.
- Unit: 1608 passed in 226 files. Browser: 1657 passed, 71 skipped, one failed. Rollback/CAS was skipped.
- Sole failure: desktop Chromium, `a profile sync notice from account A is hidden after another tab activates account B`, at the initial successful-refresh notice assertion. The switch to account B was not reached.
- The remote profile GET returned HTTP 200 and the form displayed the new cloud name. No profile PUT was observed. The Settings idle label is not evidence of a pending profile write.
- Browser artifact: `12416555191`, SHA-256 `48f3a4a413b1bef9e91883cc3de2c2730a4e760f43ba3b73468f193de6b0480c`.

## Reproduction and established cause

The unchanged Chromium test failed once in ten local repetitions. A separate, temporary instrumented run captured the same assertion failure. Instrumentation is diagnostic only and must not ship.

The captured sequence was:

1. The refresh action captures the current account's UI note setter.
2. The same account and server session adopt a renewed local session epoch.
3. The refresh validates its returned read guard and applies the cloud profile.
4. Its success callback still holds the setter from the prior epoch. The scoped setter correctly rejects that stale owner.
5. The cloud name is visible, but the success notice is absent.

This establishes a completion-publication bug across a validated session renewal. It does not justify relaxing stale callback ownership checks or weakening the remote update assertion.

## Fix and verification

`profileSync.ts` passes the exact freshly asserted read guard into `applyRemoteProfile`. `App.tsx` stores a copy of that completion guard and consumes it once in a layout effect after the scoped UI hook resets. Only an exact active account/server-session/epoch match publishes the success notice. A mismatched or signed-out completion is discarded permanently. The generic stale-setter protection is unchanged. Four existing callbacks now explicitly depend on their scoped note setter.

The original notice test remains, with additional HTTP 200 and response-name assertions. A deterministic variant renews the local read session while holding the profile GET, verifies the same account/server session and a changed epoch, waits for the new form scope to commit, then checks the cloud response, form value, visible success note, and absence of the note in both tabs after switching to B. The forced-renewal case failed on the previous runtime at the same missing-notice assertion.

An initial wider local matrix passed 34/35. Its separate WebKit failure was an existing late-response fixture holding the GET beyond the existing 12-second transport deadline: the response waiter was registered approximately 13.12 seconds after the request started. Preparing the blank second tab and its routes before the held request removes setup time from that interval. SID changes, navigation, the new-session Save, the old HTTP 200 response, and all negative persistence assertions remain. No timeout or retry was increased.

Final browser matrix: **35/35 passed** across all seven configured profiles, zero retries, in 3.6 minutes. It includes the original notice, forced epoch renewal, retired-session notice, late account-switch response, and late same-account reauthentication response scenarios. The build used for that final matrix succeeded.

Full local unit suite: **1608/1608 passed in 226 files**. Focused unit files also passed 30/30. All three TypeScript checks passed. Independent source, dependency, and final fixture reviews found no issues. Schema parity (23 migrations, 32 tables), privacy coverage (29 user-related tables), auth scope, API invariants, and admin guards passed locally. Dependency audit: zero vulnerabilities.

The first general typecheck included ignored diagnostic source snapshots under the broad project glob. Those snapshots were preserved with `.snapshot.txt` extensions, then the unchanged general typecheck passed. No compiler scope or application source was weakened to exclude failures.

The new exact SHA and full remote CI status are tracked in PR98 after the normal push. The successful local checks above do not replace that full CI or its rollback/CAS acceptance step.

No production database operations, merge, or deployment are part of this change. Production migration postchecks remain a separate release gate managed by the parent task.
