---
"@lokalise/load-testing-utils": minor
---

Added `detachable` to `ProcessSupervisor` and a `detach()` method, so a runner that leaves its stack up can exit while the processes it started keep running and stay findable with `recordedProcesses()`.
