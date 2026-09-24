---
"@lokalise/load-testing-utils": major
---

Initial release of `@lokalise/load-testing-utils`, the service-agnostic parts of a local load-test stack runner.

- `ProcessSupervisor`, which starts processes with `[name]`-prefixed output and a per-process log file, runs commands to completion or to exit, stops everything last-started first (the whole tree on Windows), and records pids so a `down` from another terminal can stop a `--keep` stack
- `waitForHealth` and `refuseIfPortTaken`, so a run never measures a process left over from an earlier session
- `composeUp` / `composeDown` for the stack's containers, with profiles
- `resolveK6Mode`, `runK6` and `buildK6Command`, running k6 locally or through the `grafana/k6` image, plus `bindAddressEnv` and `k6TargetHost` for reaching the host from a container
- `parseEnvFile`, `retargetPorts` and `omitExported` for handing a perf env file to child processes, and `parseRunnerArgs` / `splitValueArgs` for the runner's command line
- `parseProcessMetrics`, `scrapeResources`, `measureResources`, `diffResources` and `formatResourcesSection`, reporting what a run cost in CPU, GC, memory and database statements per engine, and `appendReportSection` to add that to the k6 report
- `/db-probe`: `createDbProbeServer`, `readPostgresStats` (`pg_stat_statements`, falling back to `pg_stat_database`) and `readCockroachStats` (`crdb_internal.node_statement_statistics`), taking postgres.js connections
