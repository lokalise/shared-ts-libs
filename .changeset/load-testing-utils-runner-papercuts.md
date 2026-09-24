---
"@lokalise/load-testing-utils": minor
---

Add `localBin`, which runs a package's bin with `process.execPath` instead of `npx`, and `resetReport`, which removes the previous run's report before a run so a run that failed before its summary cannot extend it, and tells the runner afterwards whether k6 wrote a new one.
