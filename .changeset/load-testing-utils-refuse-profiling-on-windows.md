---
"@lokalise/load-testing-utils": minor
---

Add `refuseProfilingOnWindows`, a runner guard that refuses to profile a process the runner starts on Windows, where `@pyroscope/nodejs` cannot start, and names WSL2 or the process's container as the way out.
