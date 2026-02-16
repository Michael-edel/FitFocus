# FitFocus v2.0-architecture

This snapshot introduces the first architecture refactor step **without breaking the app**:

- `domain/` copy of pure calculation modules (keep them framework-independent)
- `services/` helpers (content hash, AI client wrapper exports)
- `storage/` single storage layer + schema migrations + repo stubs + outbox scaffold

Next step:
- Switch App.tsx persistence calls to repos in `storage/repos.ts` (incremental, 5–8 call sites)
- Then swap repo backend from localStorage to IndexedDB (Dexie) to enable sync.


## PRO photo confidence
- services/imageQuality.ts: detects messenger compression heuristically
- services/aiConfidence.ts: confidence scoring + UX rules
- App.tsx: shows confidence indicator + "Improve analysis" button
