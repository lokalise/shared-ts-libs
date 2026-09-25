# @lokalise/load-testing-utils

## 2.0.0

### Major Changes

- 04ae446: Report what a run cost each statement, and event loop lag while the load is on.
  
  - Breaking: `ResourceDelta.eventLoopLagP99SecondsAtEnd` is replaced by `eventLoopLag` (`intervals`, `p99WorstSeconds`, `p99MedianSeconds`, `maxSeconds`), and the report's "Event loop lag p99 at end" row by worst interval, median interval, max and interval count. `measureResources` takes `{ sampleMetrics, sampleIntervalMs }` to scrape the metrics during the run; `scrapeMetrics(url)` is the usual sampler.
  - Breaking: `ResourceDelta.topStatements` is the per-statement difference between the two scrapes instead of the closing scrape's cumulative ranking. It needs the probe read with `?statements=all` at both ends, which adds `allStatements` to each engine; without it an engine gets a warning instead of a table. `diffStatements` and `summarizeEventLoopLag` are exported.
  - `readCockroachStats` reads `crdb_internal.statement_statistics`, which includes flushed statistics, instead of `node_statement_statistics`, which the node clears every `sql.stats.flush.interval`.
  - A `?statements=all` list cut at `maxStatements` carries `allStatementsTruncated`, and the report leaves out statements missing from such an opening list. `scrapeResources` waits up to 30 s for the probe. `measureResources` rejects a `sampleIntervalMs` that is not a positive number.
  - Postgres statements hidden from the probe's role (no `queryid`) are left out of the statements table, with a `reason` saying how many.
  - Statements carry a `key` (Postgres `queryid`, CockroachDB fingerprint) and are grouped by it.

### Minor Changes

- 82f344d: `formatResourcesSection(delta, run)` takes the run's totals and adds "CPU, share of one core" and "CPU per request" rows, or takes `{ reason }` and prints a warning line saying why they are missing. `readRunTotals(summary)` and `readRunTotalsFile(path)` read the totals, or that reason, from a k6 summary. A summary without HTTP requests still gives the share of a core.
- 1de265b: Add `refuseProfilingOnWindows`, a runner guard that refuses to profile a process the runner starts on Windows, where `@pyroscope/nodejs` cannot start, and names WSL2 or the process's container as the way out.
- 166d248: Added `detachable` to `ProcessSupervisor` and a `detach()` method, so a runner that leaves its stack up can exit while the processes it started keep running and stay findable with `recordedProcesses()`.

### Patch Changes

- 547a257: The Postgres probe now leaves its own queries out of the `pg_stat_statements` figures. The marker sat in front of each query, where the view never keeps it, so the probe counted itself. Its extension check and `pg_stat_database` read are now one query, so its calls no longer add to the marker-free entries an earlier version left behind.

## 1.0.0

### Major Changes

- da46757: Initial release of `@lokalise/load-testing-utils`, the service-agnostic parts of a local load-test stack runner.
  
  - `ProcessSupervisor`, which starts processes with `[name]`-prefixed output and a per-process log file, runs commands to completion or to exit, stops everything last-started first (the whole tree on Windows), and records pids so a `down` from another terminal can stop a `--keep` stack
  - `waitForHealth` and `refuseIfPortTaken`, so a run never measures a process left over from an earlier session
  - `composeUp` / `composeDown` for the stack's containers, with profiles
  - `resolveK6Mode`, `runK6` and `buildK6Command`, running k6 locally or through the `grafana/k6` image, plus `bindAddressEnv` and `k6TargetHost` for reaching the host from a container
  - `parseEnvFile`, `retargetPorts` and `omitExported` for handing a perf env file to child processes, and `parseRunnerArgs` / `splitValueArgs` for the runner's command line
  - `parseProcessMetrics`, `scrapeResources`, `measureResources`, `diffResources` and `formatResourcesSection`, reporting what a run cost in CPU, GC, memory and database statements per engine, and `appendReportSection` to add that to the k6 report
  - `/db-probe`: `createDbProbeServer`, `readPostgresStats` (`pg_stat_statements`, falling back to `pg_stat_database`) and `readCockroachStats` (`crdb_internal.node_statement_statistics`), taking postgres.js connections
