---
"@lokalise/load-testing-utils": minor
---

Add `localBin`, which runs a package's bin with `process.execPath` instead of `npx`, and `watchReport`, which tells a runner whether k6 wrote its report during the run so a run that failed before its summary does not extend the previous run's report.
