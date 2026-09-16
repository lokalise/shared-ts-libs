---
"@lokalise/pyroscope-profiling": major
---

Initial release of `@lokalise/pyroscope-profiling`, continuous CPU, wall-clock and heap profiling for Node services, built for reading a local load test without a browser.

- `pyroscope-analyze`, a dependency-free CLI that queries a local Pyroscope and prints the flat self-time table, an indented call tree, a per-frame diff between two runs, `--json` for a script or a CI gate, and `--folded` for flamegraph.pl or inferno
- `startProfiling` / `stopProfiling`, off unless `PYROSCOPE_ENABLED` is set, with the SDK imported lazily so a process that runs without profiling never loads its native binding, and every failure logged and swallowed
- `resolveProfilingConfigFromEnv` / `resolveProfilingContextFromEnv` for the `PYROSCOPE_*` and deployment variables, including the basic-auth and tenant credentials the SDK does not read itself
- `pyroscopeProfilingPlugin` (`/fastify`), which starts the profiler on register and flushes the last profile window on close, with a five-second ceiling so an unreachable ingest host cannot hold a shutdown open
- `PyroscopeSpanProcessor` and `buildPyroscopeSpanProcessors` (`/opentelemetry`), labelling the profiler's samples with the root span they were taken under, so a profile can be cut to one route locally and followed from a Grafana trace view remotely
- `withProfilingLabels` for labelling background jobs, which have no span to cut a profile by
- Every profile tagged with `env`, `version`, `commit_sha` and `instance`, sanitized of the characters Pyroscope rejects in a label
- Compose files for Pyroscope alone plus Grafana and Tempo overlays, and docs covering the local load-test loop, the Windows limitation and its two workarounds, and how to read a profile
