---
"@lokalise/pyroscope-profiling": minor
---

`pyroscopeProfilingPlugin` registers its per-request label hooks only when the profiler is running, unless `labelRequests` is set explicitly. With `start: false` it waits for the entry point's start to finish before deciding.
