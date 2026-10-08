---
"@lokalise/background-jobs-common": patch
---

Fix `AbstractPeriodicJob.asyncRegister()` running the job twice at startup when `runImmediately` is enabled. The first run is awaited, and the scheduler now only starts the interval timer. Also fix `dispose()` during the awaited first run: it no longer throws, and the job is not scheduled after the first run completes.
