# @lokalise/load-testing-utils

Building blocks for a local load-test stack: bring up a service with its
datastores and fakes, run k6 against it, report what the run cost, and tear it
all down again.

Each service keeps its own short runner for the steps only it knows (which
migrations, which seed, which fakes, which DSNs). This package holds the rest,
which is the same for every service and otherwise gets copied from one runner to
the next.

- [Install](#install)
- [A runner in outline](#a-runner-in-outline)
- [Processes](#processes)
- [Containers](#containers)
- [k6](#k6)
- [Environment](#environment)
- [Arguments](#arguments)
- [Resource report](#resource-report)
- [Database probe](#database-probe)

## Install

```bash
pnpm add -D @lokalise/load-testing-utils
```

The database probe (`@lokalise/load-testing-utils/db-probe`) takes
[postgres.js](https://github.com/porsager/postgres) connections, so a runner that
uses it also needs `postgres`. Everything else has no dependencies.

## A runner in outline

```ts
import {
  appendReportSection,
  bindAddressEnv,
  composeDown,
  composeUp,
  formatResourcesSection,
  k6TargetHost,
  localBin,
  measureResources,
  parseRunnerArgs,
  ProcessSupervisor,
  refuseIfPortTaken,
  resolveK6Mode,
  runK6,
  scrapeResources,
  waitForHealth,
  watchReport,
} from '@lokalise/load-testing-utils'

const args = parseRunnerArgs(process.argv.slice(2), {
  commands: ['run', 'up', 'k6', 'down'],
  flags: { keep: false, docker: true, profiling: false },
})
const supervisor = new ProcessSupervisor({ logDir: join(HERE, '.logs') })
const compose = { file: join(HERE, 'docker-compose.perf.yml'), project: 'my-service-perf' }
const k6Mode = resolveK6Mode(args.k6Mode)

if (args.command === 'down') {
  supervisor.stopAll(supervisor.recordedProcesses())
  composeDown(supervisor, compose, { profiles: ['profiling'] })
  supervisor.clearState()
} else {
  await refuseIfPortTaken('service', 3000, { hint: 'run with --no-service to measure it' })
  composeUp(supervisor, compose)
  // migrations and seeding: service-specific
  const tsx = localBin('tsx', ['src/server.ts'], { from: SERVICE_DIR })
  supervisor.start('service', tsx.command, tsx.args, {
    cwd: SERVICE_DIR,
    env: { ...perfEnv, ...bindAddressEnv(k6Mode, ['APP_BIND_ADDRESS']) },
  })
  await waitForHealth('service', 'http://localhost:3000/health')
  supervisor.writeState()

  const reportPath = join(K6_DIR, 'k6-report.md')
  const report = watchReport(reportPath)
  const { result: exitCode, delta } = await measureResources(
    () => scrapeResources({ metricsUrl: 'http://localhost:9080/metrics' }),
    () =>
      runK6(supervisor, {
        mode: k6Mode,
        cwd: K6_DIR,
        script: 'journeys.js',
        args: args.passthrough,
        env: { BASE_URL: `http://${k6TargetHost(k6Mode)}:3000` },
        docker: { hostDir: PERF_DIR },
      }),
  )
  if (report.written()) {
    appendReportSection(reportPath, formatResourcesSection(delta))
    process.exitCode = exitCode
  } else {
    // k6 failed before its summary, so the file on disk is the previous run's.
    process.exitCode = exitCode || 1
  }

  if (!args.flags.keep) {
    supervisor.stopAll()
    composeDown(supervisor, compose, { profiles: ['profiling'] })
    supervisor.clearState()
  }
}
```

## Processes

`ProcessSupervisor` starts and stops the processes a stack is made of.

| Method | What it does |
|---|---|
| `start(name, command, args, { cwd, env })` | Starts a long-running process. Every output line goes to the terminal prefixed `[name]`, and all of it to `<logDir>/<name>.log` |
| `run(name, command, args, { cwd, env })` | Runs to completion with inherited stdio, and throws on a non-zero exit |
| `runToExit(command, args, { cwd, env })` | Runs with inherited stdio and resolves with the exit code. Asynchronous, so the started processes' output pipes keep draining meanwhile |
| `stopAll(processes?)` | Stops the started processes and everything under them, last started first |
| `writeState(extra?)` / `readState()` / `clearState()` | Records the running pids and their start times in `stateFile` (default `<logDir>/stack-state.json`) |
| `recordedProcesses()` | The pids a `--keep` run recorded, for a `down` from another terminal to pass to `stopAll`. A pid whose process has a different start time now (after a crash or a reboot, say) is skipped and logged |

`env` is merged over `process.env`.

On Windows, `npx`, `pnpm`, `npm` and `yarn` are `.cmd` shims that Node refuses to
spawn without a shell. The supervisor sends those through `cmd.exe` as a single
line (override the list with `shimCommands`), so their arguments must not
contain spaces. Stopping a process there kills its whole tree with
`taskkill /T /F`, because a shim leaves the real process one level down.

`localBin(packageName, args, { from })` avoids both the shim and `npx`, which a
Node install without npm does not have. It finds the package in `node_modules`
from `from` upwards and returns `{ command, args }` that run its bin with
`process.execPath`, so the arguments may contain spaces. Pass `bin` when the
package declares more than one.

## Containers

```ts
const compose = { file: 'docker-compose.perf.yml', project: 'my-service-perf', cwd: HERE }
composeUp(supervisor, compose, { profiles: ['profiling'] })   // up -d --wait
composeDown(supervisor, compose, { profiles: ['profiling'], removeVolumes: false })
```

Pass every profile the file defines to `composeDown`: a `down` without a profile
leaves that profile's containers running.

## k6

`resolveK6Mode('auto')` picks a local `k6` when one answers on PATH and the
`grafana/k6` image otherwise. `runK6` runs either:

- locally, in `cwd`, with `env` as the process environment
- in Docker, with `docker.hostDir` mounted at `docker.containerDir` (default
  `/k6`), the working directory and script translated to their container paths,
  `env` passed as `-e` flags, and `host.docker.internal` mapped to the host

A containerised k6 reaches the stack through `host.docker.internal`
(`k6TargetHost(mode)`), which on Linux cannot see a socket bound to 127.0.0.1.
`bindAddressEnv(mode, ['APP_BIND_ADDRESS', ...])` returns `0.0.0.0` for those
variables in Docker mode and `127.0.0.1` otherwise, leaving out any the shell
already exported. The extra network hop makes a Docker run's latencies read a
little worse, so compare Docker runs with Docker runs.

`buildK6Command` returns the command without running it.

## Environment

| Function | What it does |
|---|---|
| `parseEnvFile(contents)` / `readEnvFile(path)` | `KEY=value` lines, `#` comments, optional double quotes. No interpolation, `export` or multi-line values |
| `retargetPorts(values, portVariables, env?)` | Rewrites `localhost:<port>` in values and bare `*_PORT` values, for every default port whose variable (`{ '5451': 'PERF_POSTGRES_PORT' }`) is set in `env` |
| `omitExported(values, env?)` | Drops the keys `env` already has, so an exported variable keeps winning over the file, as with `node --env-file` |

Anything service-specific, such as swapping a database name in a DSN, is a
`map` over the result.

## Arguments

`parseRunnerArgs(argv, { commands, flags, defaultCommand?, help? })` reads
`<command> [flags] [k6 args]`:

- `flags` are booleans with defaults, keyed in camelCase: `purgeProfiles` answers
  to `--purge-profiles` and `--no-purge-profiles`
- `--k6=local|docker|auto` sets `k6Mode`
- a bare `--` (pnpm's separator) is dropped
- everything else goes to `passthrough`, in order, for `k6 run`

In PowerShell, quote a k6 value that contains a comma: `-e 'JOURNEYS=a,b'`.
Unquoted, PowerShell takes the comma for its array operator and k6 receives `a b`.

`splitValueArgs(args, ['items'])` takes `--items=50` out of the passthrough as
`['--items', '50']`, for a seeder that reads that form. k6 exits on a flag it
does not know, so those must not reach it.

## Resource report

A k6 summary sees one end of a request. `scrapeResources` reads the other: the
service's Prometheus endpoint (prom-client default metrics) and the
[database probe](#database-probe). `measureResources(scrape, body)` scrapes
before and after `body` and returns the difference, and
`formatResourcesSection(delta)` renders it as markdown for
`appendReportSection(reportPath, section)`.

k6 writes its report from `handleSummary`, which it never reaches when the
script fails to initialise (an unknown scenario, a syntax error). Take
`watchReport(reportPath)` before the run and ask `written()` after it: when it
says no, the report on disk is the previous run's, so skip the section and exit
non-zero.

It reports CPU and GC seconds as differences, resident memory, heap and event
loop lag p99 at the end, and statements and rows per database engine. A counter
that went backwards means the process restarted mid-run, and is left out rather
than reported as a negative number. A source that did not answer becomes a
warning line instead of a zero.

## Database probe

k6 has no database client without a custom binary, so the probe is a small HTTP
server the runner reads before and after a run.

```ts
import postgres from 'postgres'
import {
  createDbProbeServer,
  PROBE_APPLICATION_NAME,
  readCockroachStats,
  readPostgresStats,
} from '@lokalise/load-testing-utils/db-probe'

const pg = postgres(process.env.POSTGRES_URL, { max: 2 })
const crdb = postgres(process.env.COCKROACH_URL, {
  max: 2,
  connection: { allow_unsafe_internals: 'true', application_name: PROBE_APPLICATION_NAME },
})

createDbProbeServer({
  engines: {
    Postgres: (top) => readPostgresStats(pg, top),
    CockroachDB: (top) => readCockroachStats(crdb, { top }),
  },
}).listen(3323, '127.0.0.1')
```

`GET /db-stats?top=10` answers every engine's counters plus its ten most
expensive statements, ranked by total database time rather than calls: a per-row
write and the batched statement replacing it differ a hundredfold in calls and
little in time. An engine that throws is reported as unavailable, with the error
as its reason, and does not cost the report the others. `GET /health` answers
200.

- **Postgres** reads `pg_stat_statements`, which has to be in
  `shared_preload_libraries` and created in the database. Without it the probe
  counts committed transactions from `pg_stat_database` and says so in `reason`.
  Written rows always come from `pg_stat_database`. The probe starts each of its
  queries with `PROBE_QUERY_MARKER` and leaves them out of the
  `pg_stat_statements` figures. The fallback can't filter them: it counts two
  transactions per scrape from the probe itself.
- **CockroachDB** reads `crdb_internal.node_statement_statistics`, which needs
  no extension and resets when the node restarts. From v26.1 it refuses
  `crdb_internal` reads unless the session sets `allow_unsafe_internals`, as
  above. Cockroach's own jobs and the probe's own session (matched by
  `application_name`) are left out. It keeps no written-rows counter, so the
  report omits that row for it.
