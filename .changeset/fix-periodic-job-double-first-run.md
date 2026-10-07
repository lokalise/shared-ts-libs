---
"@lokalise/background-jobs-common": patch
---

Fix `AbstractPeriodicJob.asyncRegister()` running the job twice at startup when `runImmediately` is enabled. The first run is awaited, and the scheduler now only starts the interval timer.
