# @lokalise/pyroscope-profiling

## 1.1.0

### Minor Changes

- c800f9e: `pyroscopeProfilingPlugin` registers its per-request label hooks only when the profiler is running, unless `labelRequests` is set explicitly. With `start: false` it waits for the entry point's start to finish before deciding.

## 1.0.0

### Major Changes

- 831a086: Initial release of `@lokalise/pyroscope-profiling`, continuous CPU, wall-clock and heap profiling for Node services, built for reading a local load test without a browser.
  
  - `pyroscope-analyze`, a dependency-free CLI that queries a local Pyroscope and prints the flat self-time table, an indented call tree, a per-frame diff between two runs, `--json` for a script or a CI gate, and `--folded` for flamegraph.pl or inferno
  - `startProfiling` / `stopProfiling`, off unless `PYROSCOPE_ENABLED` is set, with the SDK imported lazily so a process that runs without profiling never loads its native binding, and every failure logged and swallowed
  - `resolveProfilingConfigFromEnv` / `resolveProfilingContextFromEnv` for the `PYROSCOPE_*` and deployment variables, including the basic-auth and tenant credentials the SDK does not read itself
  - `pyroscopeProfilingPlugin` (`/fastify`), which starts the profiler on register, labels the samples taken during each request with its route, and flushes the last profile window on close, with a five-second ceiling so an unreachable ingest host cannot hold a shutdown open
  - `PyroscopeSpanProcessor` and `buildPyroscopeSpanProcessors` (`/opentelemetry`), labelling the profiler's samples with the local root span they were taken under, so a single load test gives a flame graph per journey (`--select 'span_name="POST /v1/checkout"'`) and a Grafana trace view links straight to the profile taken while a span was open
  - `withProfilingLabels` for labelling background jobs, which have no span to cut a profile by, and `withJobLabels` for applying it once in an abstract job processor rather than per subclass: the profiler carries one label set for the whole process, so a service that labels some of its processors and not others gets a filter that silently includes the rest
  - Every profile tagged with `env`, `version`, `commit_sha` and `instance`, sanitized of the characters Pyroscope rejects in a label
  - Compose files for Pyroscope alone plus Grafana and Tempo overlays, and docs covering the local load-test loop, the Windows limitation and its two workarounds, and how to read a profile
