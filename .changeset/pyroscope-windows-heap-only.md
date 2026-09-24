---
"@lokalise/pyroscope-profiling": minor
---

On Windows, `startProfiling` now starts heap profiling alone and logs a warning, instead of failing because the wall profiler cannot run there. Wall and CPU profiles and labels still need linux.
